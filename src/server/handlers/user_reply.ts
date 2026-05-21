import 'server-only';
import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { hazo_get_auth } from 'hazo_auth/server-lib';
import { create_submission_service } from '../../db/submission_service.js';
import { create_event_service } from '../../db/event_service.js';
import { sanitize_body_html } from '../../sanitize/body_html.js';
import { send_reply_notification } from '../../notify/send_reply_notification.js';
import { validate_reply_payload } from '../validators/reply_payload.js';
import { check_rate_limit } from '../../rate_limit/token_bucket.js';
import { get_feedback_config } from '../../config/load_config.js';
import type { Logger } from '../../types.js';

interface UserReplyOptions {
  getHazoConnect: () => Promise<unknown> | unknown;
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
  const { getHazoConnect, appId, threadUrlBuilder, notifyOptions, listAdminsForBroadcast, logger } = opts;
  const config = get_feedback_config();

  try {
    const auth = await hazo_get_auth(request as unknown as Parameters<typeof hazo_get_auth>[0]);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const refId = params.refId;
    if (!refId) return NextResponse.json({ error: 'Missing refId' }, { status: 400 });

    let body: unknown;
    try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
    const v = validate_reply_payload(body);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 422 });

    const userId = auth.user.id;
    // Key uses ':user:' segment so token_bucket routes to perUserCount/perUserWindowMs
    const rate_ok = check_rate_limit(`${appId}:user:${userId}`, config.rateLimitConfig);
    if (!rate_ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    const adapter = await getHazoConnect();
    const submission_service = create_submission_service(adapter);
    const event_service = create_event_service(adapter);

    const submission = await submission_service.get_submission_by_ref(refId);
    if (!submission) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (submission.marked_spam) return NextResponse.json({ error: 'Forbidden (spam)' }, { status: 403 });
    if (submission.user_id !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const admin_reply_count = await event_service.count_admin_replies(submission.id);
    if (admin_reply_count === 0) {
      return NextResponse.json(
        { error: 'Cannot reply before admin response' },
        { status: 409 },
      );
    }

    const safe_html = sanitize_body_html(v.body_html, new Map());
    const event = await event_service.log_event({
      id: randomUUID(),
      submission_id: submission.id,
      actor_id: userId,
      event_type: 'user_reply',
      from_value: null,
      to_value: null,
      comment: null,
      body_html: safe_html,
      body_text: v.body_text,
    });

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
          replyBodyText: v.body_text,
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
    logger?.error('handle_user_reply: unexpected error', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
