import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { hazo_get_auth } from 'hazo_auth/server-lib';
import { create_submission_service } from '../../db/submission_service.js';
import { create_event_service } from '../../db/event_service.js';
import type { Logger } from '../../types.js';

interface AdminHandlerOptions {
  getHazoConnect: () => Promise<unknown> | unknown;
  appId: string;
  adminScope: string;
  logger?: Logger;
}

export async function handle_admin_comment(
  request: NextRequest,
  params: Record<string, string>,
  opts: AdminHandlerOptions
): Promise<NextResponse> {
  const { getHazoConnect, adminScope, logger } = opts;

  try {
    const auth = await hazo_get_auth(
      request as unknown as Parameters<typeof hazo_get_auth>[0],
      { required_permissions: [adminScope] }
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

    let body: { comment?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const comment = body.comment;
    if (typeof comment !== 'string' || comment.trim().length === 0) {
      return NextResponse.json({ error: 'comment must be a non-empty string' }, { status: 400 });
    }

    const adapter = await getHazoConnect();
    const submission_service = create_submission_service(adapter);
    const event_service = create_event_service(adapter);

    const submission = await submission_service.get_submission(id);
    if (!submission) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const actor_id: string = (auth.user as { id: string })?.id ?? null;

    const event = await event_service.log_event({
      id: crypto.randomUUID(),
      submission_id: id,
      actor_id,
      event_type: 'comment_added',
      from_value: null,
      to_value: null,
      comment: comment.trim(),
    });

    return NextResponse.json({ event }, { status: 201 });
  } catch (err) {
    logger?.error('handle_admin_comment: unexpected error', {
      error: String(err),
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
