import 'server-only';
import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { hazo_get_auth } from 'hazo_auth/server-lib';
import { create_submission_service } from '../../db/submission_service.js';
import { create_event_service } from '../../db/event_service.js';
import { sanitize_body_html } from '../../sanitize/body_html.js';
import { send_reply_notification } from '../../notify/send_reply_notification.js';
import { validate_reply_payload } from '../validators/reply_payload.js';
import { get_feedback_config } from '../../config/load_config.js';
import type { Logger } from '../../types.js';

interface AdminReplyOptions {
  getHazoConnect: () => Promise<unknown> | unknown;
  appId: string;
  adminScope: string;
  threadUrlBuilder?: (refId: string, submissionId: string) => string;
  notifyOptions?: { from: string; fromName?: string };
  logger?: Logger;
}

export async function handle_admin_reply(
  request: NextRequest,
  params: Record<string, string>,
  opts: AdminReplyOptions,
): Promise<NextResponse> {
  const { getHazoConnect, adminScope, threadUrlBuilder, notifyOptions, logger } = opts;
  const config = get_feedback_config();

  try {
    const auth = await hazo_get_auth(
      request as unknown as Parameters<typeof hazo_get_auth>[0],
      { required_permissions: [adminScope] },
    );
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!auth.permission_ok) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const id = params.id;
    if (!id) {
      return NextResponse.json({ error: 'Missing submission id' }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const v = validate_reply_payload(body);
    if (!v.ok) {
      return NextResponse.json({ error: v.error }, { status: 422 });
    }

    const adapter = await getHazoConnect();
    const submission_service = create_submission_service(adapter);
    const event_service = create_event_service(adapter);

    const submission = await submission_service.get_submission(id);
    if (!submission) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (submission.marked_spam) {
      return NextResponse.json({ error: 'Forbidden (spam)' }, { status: 403 });
    }

    const safe_html = sanitize_body_html(v.body_html, new Map());

    const actor_id: string = auth.user?.id ?? null;

    const event = await event_service.log_event({
      id: randomUUID(),
      submission_id: id,
      actor_id,
      event_type: 'admin_reply',
      from_value: null,
      to_value: null,
      comment: null,
      body_html: safe_html,
      body_text: v.body_text,
    });

    if (submission.user_id) {
      const thread_url = (threadUrlBuilder ?? ((refId) => `/feedback/thread/${refId}`))(
        submission.ref_id,
        submission.id,
      );

      send_reply_notification({
        direction: 'admin_to_user',
        recipientUserIds: [submission.user_id],
        refId: submission.ref_id,
        submissionId: submission.id,
        subject: submission.subject ?? '(no subject)',
        category: submission.category,
        replyBodyText: v.body_text,
        replierName: auth.user?.name ?? 'Support',
        threadUrl: thread_url,
        emailEnabled: config.notifyConfig.replyEmailToUserEnabled,
        from: notifyOptions?.from ?? '',
        fromName: notifyOptions?.fromName,
        scopeId: '',
      }).catch((err: unknown) => {
        logger?.warn('handle_admin_reply: notification failed', { error: String(err) });
      });
    }

    return NextResponse.json({ event }, { status: 201 });
  } catch (err) {
    logger?.error('handle_admin_reply: unexpected error', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
