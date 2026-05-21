import 'server-only';
import { randomUUID } from 'crypto';
import TurndownService from 'turndown';
import { NextRequest, NextResponse } from 'next/server';
import { hazo_get_auth } from 'hazo_auth/server-lib';
import { create_submission_service } from '../../db/submission_service.js';
import { create_event_service } from '../../db/event_service.js';
import { create_attachment_service } from '../../db/attachment_service.js';
import { sanitize_body_html } from '../../sanitize/body_html.js';
import { send_reply_notification } from '../../notify/send_reply_notification.js';
import { validate_reply_body_html } from '../validators/reply_payload.js';
import { check_rate_limit } from '../../rate_limit/token_bucket.js';
import { get_feedback_config } from '../../config/load_config.js';
import type { AttachmentKind, Logger } from '../../types.js';
import type { FileManager, FileItem } from 'hazo_files';

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
const MAX_REPLY_ATTACHMENTS = 10;

interface UserReplyOptions {
  getHazoConnect: () => Promise<unknown> | unknown;
  getFileManager: () => Promise<unknown> | unknown;
  appId: string;
  adminScope: string;
  threadUrlBuilder?: (refId: string, submissionId: string) => string;
  notifyOptions?: { from: string; fromName?: string };
  listAdminsForBroadcast?: () => Promise<string[]>;
  logger?: Logger;
}

export async function handle_user_reply(
  request: NextRequest,
  params: Record<string, string>,
  opts: UserReplyOptions,
): Promise<NextResponse> {
  const { getHazoConnect, getFileManager, appId, threadUrlBuilder, notifyOptions, listAdminsForBroadcast, logger } = opts;
  const config = get_feedback_config();
  const uploaded_paths: string[] = [];

  try {
    const auth = await hazo_get_auth(request as unknown as Parameters<typeof hazo_get_auth>[0]);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const refId = params.refId;
    if (!refId) return NextResponse.json({ error: 'Missing refId' }, { status: 400 });

    // ── Parse multipart ──────────────────────────────────────────────────────
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: 'Failed to parse form data' }, { status: 400 });
    }

    const get = (key: string): string | null => {
      const v = form.get(key);
      return typeof v === 'string' ? v : null;
    };

    const v = validate_reply_body_html(get('body_html') ?? '');
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 422 });

    const userId = auth.user.id;
    const rate_ok = check_rate_limit(`${appId}:user:${userId}`, config.rateLimitConfig);
    if (!rate_ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    const adapter = await getHazoConnect();
    const submission_service = create_submission_service(adapter);
    const event_service = create_event_service(adapter);
    const attachment_service = create_attachment_service(adapter);

    const submission = await submission_service.get_submission_by_ref(refId);
    if (!submission) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (submission.marked_spam) return NextResponse.json({ error: 'Forbidden (spam)' }, { status: 403 });
    if (submission.user_id !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const admin_reply_count = await event_service.count_admin_replies(submission.id);
    if (admin_reply_count === 0) {
      return NextResponse.json({ error: 'Cannot reply before admin response' }, { status: 409 });
    }

    // ── Process attachments ──────────────────────────────────────────────────
    const event_id = randomUUID();
    const fm = (await getFileManager()) as FileManager;
    const attachment_map = new Map<string, string>();
    const attach_config = config.attachmentConfig;
    const effective_max = Math.min(attach_config.maxCount, MAX_REPLY_ATTACHMENTS);

    const attachment_entries: {
      file: File; kind: AttachmentKind; inline_id: string | null; index: number;
    }[] = [];

    for (const [key, value] of form.entries()) {
      const match = key.match(/^attachment_(\d+)$/);
      if (!match || !(value instanceof File)) continue;
      const i = parseInt(match[1], 10);
      const kind_raw = get(`attachment_${i}_kind`) ?? 'uploaded_file';
      const inline_id = get(`attachment_${i}_inline_id`) ?? null;
      const valid_kinds: AttachmentKind[] = ['screenshot', 'pasted_image', 'uploaded_file'];
      const kind: AttachmentKind = valid_kinds.includes(kind_raw as AttachmentKind)
        ? (kind_raw as AttachmentKind) : 'uploaded_file';
      attachment_entries.push({ file: value, kind, inline_id, index: i });
    }

    const limited = attachment_entries.slice(0, effective_max);

    for (const entry of limited) {
      if (entry.file.size > attach_config.maxBytesPerFile) {
        return NextResponse.json(
          { error: `Attachment ${entry.index} exceeds max file size` },
          { status: 400 },
        );
      }
    }

    for (const entry of limited) {
      const attachment_id = randomUUID();
      const remote_path = `feedback/${appId}/${submission.id}/events/${event_id}/${attachment_id}`;
      const buffer = Buffer.from(await entry.file.arrayBuffer());
      const mime_type = entry.file.type || 'application/octet-stream';

      const upload = await fm.uploadFile(buffer, remote_path, { metadata: { mimeType: mime_type } });
      if (!upload.success || !upload.data) {
        logger?.error('handle_user_reply: file upload failed', { error: upload.error });
        return NextResponse.json({ error: 'File upload failed' }, { status: 500 });
      }
      uploaded_paths.push((upload.data as FileItem).path);

      await attachment_service.insert_event_attachment({
        id: attachment_id,
        event_id,
        inline_id: entry.inline_id,
        file_id: (upload.data as FileItem).path,
        mime_type,
        size_bytes: entry.file.size,
        kind: entry.kind,
        created_at: new Date().toISOString(),
      });

      if (entry.inline_id) attachment_map.set(entry.inline_id, attachment_id);
    }

    // ── Sanitize + derive plain text ─────────────────────────────────────────
    const safe_html = sanitize_body_html(v.body_html, attachment_map);
    const body_text = safe_html ? turndown.turndown(safe_html) : '';

    const event = await event_service.log_event({
      id: event_id,
      submission_id: submission.id,
      actor_id: userId,
      event_type: 'user_reply',
      from_value: null,
      to_value: null,
      comment: null,
      body_html: safe_html,
      body_text,
    });

    // ── Notify ────────────────────────────────────────────────────────────────
    if (listAdminsForBroadcast) {
      const admin_ids = await listAdminsForBroadcast();
      if (admin_ids.length > 0) {
        const thread_url = (threadUrlBuilder ?? ((r: string) => `/feedback/thread/${r}`))(
          submission.ref_id,
          submission.id,
        );
        send_reply_notification({
          direction: 'user_to_admin',
          recipientUserIds: admin_ids,
          refId: submission.ref_id,
          submissionId: submission.id,
          subject: submission.subject ?? '(no subject)',
          category: submission.category,
          replyBodyText: body_text,
          replierName: auth.user.name ?? auth.user.email_address ?? 'User',
          threadUrl: thread_url,
          emailEnabled: config.notifyConfig.replyEmailToAdminEnabled,
          from: notifyOptions?.from ?? '',
          fromName: notifyOptions?.fromName,
          scopeId: '',
        }).catch((err: unknown) => {
          logger?.warn('handle_user_reply: notification failed', { error: String(err) });
        });
      }
    }

    return NextResponse.json({ event }, { status: 201 });
  } catch (err) {
    if (uploaded_paths.length > 0) {
      const fm = await (opts.getFileManager() as Promise<FileManager>).catch(() => null);
      if (fm) await Promise.allSettled(uploaded_paths.map((p) => fm.deleteFile(p)));
    }
    logger?.error('handle_user_reply: unexpected error', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
