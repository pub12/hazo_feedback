import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { hazo_get_auth } from 'hazo_auth/server-lib';
import { create_submission_service } from '../../db/submission_service.js';
import { create_attachment_service } from '../../db/attachment_service.js';
import { create_event_service } from '../../db/event_service.js';
import type { Logger } from '../../types.js';

interface AdminHandlerOptions {
  getHazoConnect: () => Promise<unknown> | unknown;
  appId: string;
  adminScope: string;
  logger?: Logger;
}

export async function handle_admin_detail(
  request: NextRequest,
  params: Record<string, string>,
  opts: AdminHandlerOptions
): Promise<NextResponse> {
  const { getHazoConnect, adminScope, logger } = opts;

  try {
    const auth = await hazo_get_auth(request as unknown as Parameters<typeof hazo_get_auth>[0], { required_permissions: [adminScope] });
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

    const adapter = await getHazoConnect();
    const submission_service = create_submission_service(adapter);

    let submission = await submission_service.get_submission(id);

    // Fall back to ref_id lookup if direct id lookup returned nothing
    if (!submission) {
      submission = await submission_service.get_submission_by_ref(id);
    }

    if (!submission) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const attachment_service = create_attachment_service(adapter);
    const event_service = create_event_service(adapter);

    const [attachments, events] = await Promise.all([
      attachment_service.list_for_submission(submission.id),
      event_service.list_for_submission(submission.id),
    ]);

    return NextResponse.json({ submission, attachments, events });
  } catch (err) {
    logger?.error('handle_admin_detail: unexpected error', {
      error: String(err),
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
