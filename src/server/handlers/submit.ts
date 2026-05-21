import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import TurndownService from 'turndown';
import { hazo_get_auth, ensure_anon_id, get_client_ip } from 'hazo_auth/server-lib';
import { create_submission_service } from '../../db/submission_service.js';
import { create_attachment_service } from '../../db/attachment_service.js';
import { check_rate_limit } from '../../rate_limit/token_bucket.js';
import { redact_context, redact_breadcrumbs } from '../../redact/pii_redact.js';
import { sanitize_body_html } from '../../sanitize/body_html.js';
import { generate_ref_id } from '../../ref/ref_id.js';
import { get_feedback_config } from '../../config/load_config.js';
import { send_acknowledgement } from '../../notify/send_acknowledgement.js';
import type { BreadcrumbEntry, AttachmentKind, Logger } from '../../types.js';
import type { FileManager, FileItem } from 'hazo_files';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SubmitHandlerOptions {
  getHazoConnect: () => Promise<unknown> | unknown;
  getFileManager: () => Promise<unknown> | unknown;
  appId: string;
  adminScope: string;
  notifyOptions?: {
    getHazoConnect: () => Promise<unknown> | unknown;
    from: string;
    fromName?: string;
  };
  threadUrlBuilder?: (refId: string, submissionId: string) => string;
  logger?: Logger;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CONSUMER_CONTEXT_MAX_BYTES = 65536; // 64 KB
const MAX_ATTACHMENT_COUNT = 20; // hard ceiling; config can lower it
const VALID_CATEGORIES = new Set(['bug', 'feature', 'general', 'praise']);
const VALID_REPRODUCIBILITY = new Set(['always', 'sometimes', 'once', null]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Instantiated once at module load to avoid repeated constructor overhead.
const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });

function safe_parse_json<T = unknown>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Truncate consumer_context by removing keys one-by-one until the JSON
 * representation fits within CONSUMER_CONTEXT_MAX_BYTES. Operates on a
 * shallow copy so the original is never mutated.
 */
function cap_consumer_context(
  ctx: Record<string, unknown>,
  logger?: Logger
): Record<string, unknown> {
  let copy = { ...ctx };

  if (JSON.stringify(copy).length <= CONSUMER_CONTEXT_MAX_BYTES) {
    return copy;
  }

  logger?.warn('handle_submit: consumer_context exceeds 64 KB, truncating', {
    original_key_count: Object.keys(ctx).length,
  });

  // Remove keys from the end until the payload fits.
  const keys = Object.keys(copy);
  for (let i = keys.length - 1; i >= 0; i--) {
    const key = keys[i];
    const { [key]: _removed, ...rest } = copy;
    copy = rest;
    if (JSON.stringify(copy).length <= CONSUMER_CONTEXT_MAX_BYTES) {
      break;
    }
  }

  return copy;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function handle_submit(
  request: NextRequest,
  opts: SubmitHandlerOptions
): Promise<NextResponse> {
  const { getHazoConnect, getFileManager, appId, notifyOptions, threadUrlBuilder, logger } = opts;

  const config = get_feedback_config();
  const effective_app_id = appId || config.appId;

  const uploaded_paths: string[] = [];

  try {
    // ── 1. Parse formData ────────────────────────────────────────────────────
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

    // Required fields
    const category_raw = get('category');
    if (!category_raw || !VALID_CATEGORIES.has(category_raw)) {
      return NextResponse.json(
        { error: `category must be one of: ${[...VALID_CATEGORIES].join(', ')}` },
        { status: 400 }
      );
    }

    const url_field = get('url');
    if (!url_field) {
      return NextResponse.json({ error: 'url is required' }, { status: 400 });
    }

    const form_app_id = get('app_id');
    const resolved_app_id = form_app_id || effective_app_id;

    // Optional scalar fields
    const source          = get('source');
    const subject         = get('subject');
    const problem         = get('problem');
    const intent          = get('intent');
    const expected_output = get('expected_output');
    const reproducibility_raw = get('reproducibility');
    const route           = get('route');
    const user_agent      = get('user_agent');
    const app_version     = get('app_version');
    const raw_body_html   = get('body_html') ?? '';

    const viewport_w = parseInt(get('viewport_w') ?? '', 10);
    const viewport_h = parseInt(get('viewport_h') ?? '', 10);

    const reproducibility = VALID_REPRODUCIBILITY.has(reproducibility_raw)
      ? (reproducibility_raw as 'always' | 'sometimes' | 'once' | null)
      : null;

    // JSON fields
    const consumer_context_raw  = get('consumer_context');
    const consumer_context_redacted_raw = get('consumer_context_redacted');
    const recent_errors_raw     = get('recent_errors');
    const breadcrumbs_raw       = get('breadcrumbs');

    // ── 2. Resolve identity ──────────────────────────────────────────────────
    // Cast to unknown to avoid Next.js version skew between the workspace root
    // and hazo_auth's own next devDependency. At runtime these are the same type.
    const auth = await hazo_get_auth(request as unknown as Parameters<typeof hazo_get_auth>[0]);

    let user_id: string | null              = null;
    let user_name_snapshot: string | null   = null;
    let user_email_snapshot: string | null  = null;
    let anon_session_id: string | null      = null;

    if (auth.authenticated && auth.user) {
      user_id             = auth.user.id;
      user_name_snapshot  = auth.user.name ?? null;
      user_email_snapshot = auth.user.email_address ?? null;
    } else {
      anon_session_id = await ensure_anon_id(request as unknown as Parameters<typeof ensure_anon_id>[0]);
    }

    // ── 3. Rate limiting ─────────────────────────────────────────────────────
    const ip = get_client_ip(request as unknown as Parameters<typeof get_client_ip>[0]);
    const rate_config = config.rateLimitConfig;

    if (auth.authenticated && user_id) {
      const user_ok = check_rate_limit(`${resolved_app_id}:user:${user_id}`, rate_config);
      if (!user_ok) {
        logger?.warn('handle_submit: rate limit hit (user)', { user_id });
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
      }
    } else {
      const anon_ok = check_rate_limit(`${resolved_app_id}:anon:${anon_session_id}`, rate_config);
      const ip_ok   = check_rate_limit(`${resolved_app_id}:ip:${ip}`, rate_config);
      if (!anon_ok || !ip_ok) {
        logger?.warn('handle_submit: rate limit hit (anon/ip)', { anon_session_id, ip });
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
      }
    }

    // ── 4. PII redaction ─────────────────────────────────────────────────────
    let consumer_context: Record<string, unknown> | null = null;
    let consumer_context_redacted_keys: string[] = safe_parse_json<string[]>(consumer_context_redacted_raw) ?? [];

    if (consumer_context_raw) {
      const parsed_ctx = safe_parse_json<Record<string, unknown>>(consumer_context_raw);
      if (parsed_ctx && typeof parsed_ctx === 'object' && !Array.isArray(parsed_ctx)) {
        const capped = cap_consumer_context(parsed_ctx, logger);
        const { redacted, keys } = redact_context(capped);
        consumer_context = redacted;
        // Merge server-detected redacted keys with client-declared ones
        const merged = new Set([...consumer_context_redacted_keys, ...keys]);
        consumer_context_redacted_keys = [...merged];
      }
    }

    let breadcrumbs: BreadcrumbEntry[] | null = null;
    const parsed_breadcrumbs = safe_parse_json<BreadcrumbEntry[]>(breadcrumbs_raw);
    if (Array.isArray(parsed_breadcrumbs)) {
      breadcrumbs = redact_breadcrumbs(parsed_breadcrumbs);
    }

    const recent_errors = safe_parse_json<unknown[]>(recent_errors_raw);

    // ── 5. Generate ref_id with retry ────────────────────────────────────────
    const submission_id = randomUUID();
    const adapter = await getHazoConnect();
    const submission_service = create_submission_service(adapter);

    let ref_id: string | null = null;
    for (let attempt = 1 as 1 | 2 | 3; attempt <= 3; attempt++) {
      const candidate = generate_ref_id(submission_id, resolved_app_id, attempt);
      const existing = await submission_service.get_submission_by_ref(candidate);
      if (!existing) {
        ref_id = candidate;
        break;
      }
    }

    if (!ref_id) {
      logger?.error('handle_submit: ref_id collision on all 3 attempts', { submission_id });
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    // ── 6. INSERT initial submission row ─────────────────────────────────────
    const now = new Date().toISOString();
    await submission_service.insert_submission({
      id: submission_id,
      ref_id,
      app_id: resolved_app_id,
      source,
      user_id,
      user_name_snapshot,
      user_email_snapshot,
      anon_session_id,
      category: category_raw,
      subject,
      problem,
      intent,
      expected_output,
      reproducibility,
      body_html: null,
      body_text: null,
      status: 'new',
      priority: null,
      marked_spam: false,
      url: url_field,
      route,
      viewport_w: isNaN(viewport_w) ? null : viewport_w,
      viewport_h: isNaN(viewport_h) ? null : viewport_h,
      user_agent,
      app_version,
      consumer_context: consumer_context ? JSON.stringify(consumer_context) : null,
      consumer_context_redacted:
        consumer_context_redacted_keys.length > 0
          ? JSON.stringify(consumer_context_redacted_keys)
          : null,
      recent_errors: recent_errors ? JSON.stringify(recent_errors) : null,
      breadcrumbs: breadcrumbs ? JSON.stringify(breadcrumbs) : null,
      attachment_count: 0,
      acknowledge_email_sent_at: null,
      created_at: now,
      updated_at: now,
      resolved_at: null,
    });

    // ── 7. Process attachments ────────────────────────────────────────────────
    const attach_config = config.attachmentConfig;
    const fm = (await getFileManager()) as FileManager;
    const attachment_service = create_attachment_service(adapter);

    // Collect all attachment_* file entries from the form
    interface AttachmentEntry {
      file: File;
      kind: AttachmentKind;
      inline_id: string | null;
      index: number;
    }
    const attachment_entries: AttachmentEntry[] = [];

    for (const [key, value] of form.entries()) {
      const match = key.match(/^attachment_(\d+)$/);
      if (!match || !(value instanceof File)) continue;

      const i = parseInt(match[1], 10);
      const kind_raw = get(`attachment_${i}_kind`) ?? 'uploaded_file';
      const inline_id = get(`attachment_${i}_inline_id`) ?? null;

      const valid_kinds: AttachmentKind[] = ['screenshot', 'pasted_image', 'uploaded_file'];
      const kind: AttachmentKind = valid_kinds.includes(kind_raw as AttachmentKind)
        ? (kind_raw as AttachmentKind)
        : 'uploaded_file';

      attachment_entries.push({ file: value, kind, inline_id, index: i });
    }

    // Hard-cap the number of attachments
    const effective_max = Math.min(attach_config.maxCount, MAX_ATTACHMENT_COUNT);
    const limited_entries = attachment_entries.slice(0, effective_max);

    // Validate total size
    let total_bytes = 0;
    for (const entry of limited_entries) {
      if (entry.file.size > attach_config.maxBytesPerFile) {
        return NextResponse.json(
          {
            error: `Attachment ${entry.index} exceeds maximum file size of ${attach_config.maxBytesPerFile} bytes`,
          },
          { status: 400 }
        );
      }
      total_bytes += entry.file.size;
    }

    if (total_bytes > attach_config.totalMaxBytes) {
      return NextResponse.json(
        { error: `Total attachment size exceeds ${attach_config.totalMaxBytes} bytes` },
        { status: 400 }
      );
    }

    // Map: inline_id → attachment DB id (for body_html rewriting)
    const attachment_map = new Map<string, string>();

    for (const entry of limited_entries) {
      const attachment_id = randomUUID();
      const remote_path = `feedback/${resolved_app_id}/${submission_id}/${attachment_id}`;
      const buffer = Buffer.from(await entry.file.arrayBuffer());
      const mime_type = entry.file.type || 'application/octet-stream';

      const upload_result = await fm.uploadFile(buffer, remote_path, {
        metadata: { mimeType: mime_type },
      });

      if (!upload_result.success || !upload_result.data) {
        logger?.error('handle_submit: file upload failed', {
          submission_id,
          attachment_index: entry.index,
          error: upload_result.error,
        });
        return NextResponse.json({ error: 'File upload failed' }, { status: 500 });
      }

      const file_item = upload_result.data as FileItem;
      uploaded_paths.push(file_item.path);

      await attachment_service.insert_submission_attachment({
        id: attachment_id,
        submission_id,
        inline_id: entry.inline_id,
        file_id: file_item.path,
        mime_type,
        size_bytes: entry.file.size,
        kind: entry.kind,
        created_at: new Date().toISOString(),
      });

      if (entry.inline_id) {
        attachment_map.set(entry.inline_id, attachment_id);
      }
    }

    // ── 8 & 9. Sanitize body_html, rewriting inline image references ─────────
    const body_html = sanitize_body_html(raw_body_html, attachment_map);

    // ── 10. Extract plain text and UPDATE submission ──────────────────────────
    const body_text = body_html ? turndown.turndown(body_html) : null;

    await submission_service.update_submission(submission_id, {
      body_html: body_html || null,
      body_text,
      attachment_count: limited_entries.length,
    });

    // ── 11. Send acknowledgement email (fire-and-forget) ─────────────────────
    if (
      notifyOptions &&
      config.notifyConfig.acknowledgeEmailEnabled &&
      config.notifyConfig.acknowledgeEmailFrom &&
      user_email_snapshot
    ) {
      send_acknowledgement({
        to: user_email_snapshot,
        from: notifyOptions.from,
        fromName: notifyOptions.fromName,
        refId: ref_id,
        name: user_name_snapshot ?? user_email_snapshot,
        subject: config.notifyConfig.acknowledgeEmailSubject,
        category: category_raw,
        submittedAt: new Date(),
        recipientUserId: user_id ?? "",
        scopeId: "",
        deepLink: (threadUrlBuilder ?? ((r) => `/feedback/thread/${r}`))(ref_id, submission_id),
      }).catch((err: unknown) => {
        logger?.warn('handle_submit: acknowledgement email failed', { error: String(err) });
      });
    }

    // ── 12. Return ────────────────────────────────────────────────────────────
    return NextResponse.json({ submissionId: submission_id, refId: ref_id }, { status: 201 });
  } catch (err) {
    // Rollback any uploaded files before re-throwing or responding
    if (uploaded_paths.length > 0) {
      const fm = await (opts.getFileManager() as Promise<FileManager>).catch(() => null);
      if (fm) {
        await Promise.allSettled(uploaded_paths.map((p) => fm.deleteFile(p)));
      }
    }

    logger?.error('handle_submit: unexpected error', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
