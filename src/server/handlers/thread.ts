import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { hazo_get_auth } from 'hazo_auth/server-lib';
import { create_submission_service } from '../../db/submission_service.js';
import { create_event_service } from '../../db/event_service.js';
import { create_attachment_service } from '../../db/attachment_service.js';
import type { Logger } from '../../types.js';

interface ThreadOptions {
  getHazoConnect: () => Promise<unknown> | unknown;
  appId: string;
  adminScope: string;
  logger?: Logger;
}

export async function handle_thread(
  request: NextRequest,
  params: Record<string, string>,
  opts: ThreadOptions,
): Promise<NextResponse> {
  const { getHazoConnect, adminScope, logger } = opts;

  try {
    const auth = await hazo_get_auth(request as unknown as Parameters<typeof hazo_get_auth>[0]);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const refId = params.refId;
    if (!refId) return NextResponse.json({ error: 'Missing refId' }, { status: 400 });

    const adapter = await getHazoConnect();
    const submission_service = create_submission_service(adapter);
    const event_service = create_event_service(adapter);
    const attachment_service = create_attachment_service(adapter);

    const submission = await submission_service.get_submission_by_ref(refId);
    if (!submission) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const is_admin = auth.permissions.includes(adminScope);
    const is_submitter = submission.user_id === auth.user.id;

    if (!is_admin && !is_submitter) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const replies = await event_service.list_replies_for_submission(submission.id);
    const attachment_lists = await Promise.all(
      replies.map((r) => attachment_service.list_for_event(r.id)),
    );
    const reply_attachments_by_event = new Map<string, unknown[]>();
    replies.forEach((r, i) => reply_attachments_by_event.set(r.id, attachment_lists[i]));

    const has_admin_reply = replies.some((r) => r.event_type === 'admin_reply');

    return NextResponse.json({
      submission: {
        id: submission.id,
        ref_id: submission.ref_id,
        subject: submission.subject,
        category: submission.category,
        status: submission.status,
        created_at: submission.created_at,
        user_id: submission.user_id,
      },
      replies: replies.map((r) => ({
        id: r.id,
        actor_id: r.actor_id,
        event_type: r.event_type,
        body_html: r.body_html,
        body_text: r.body_text,
        attachments: reply_attachments_by_event.get(r.id) ?? [],
        created_at: r.created_at,
      })),
      viewer_role: is_admin ? 'admin' : 'submitter',
      can_reply: is_submitter && has_admin_reply,
    });
  } catch (err) {
    logger?.error('handle_thread: unexpected error', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
