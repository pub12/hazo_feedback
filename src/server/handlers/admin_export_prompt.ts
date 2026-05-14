import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { hazo_get_auth } from 'hazo_auth/server-lib';
import { create_submission_service } from '../../db/submission_service.js';
import { create_attachment_service } from '../../db/attachment_service.js';
import { create_event_service } from '../../db/event_service.js';
import { build_prompt } from '../../prompt/build_prompt.js';
import type { Logger } from '../../types.js';
import { randomUUID } from 'crypto';

interface AdminHandlerOptions {
  getHazoConnect: () => Promise<unknown> | unknown;
  getFileManager?: () => Promise<unknown> | unknown;
  appId: string;
  adminScope: string;
  logger?: Logger;
}

export async function handle_admin_export_prompt(
  request: NextRequest,
  params: Record<string, string>,
  opts: AdminHandlerOptions
): Promise<NextResponse> {
  const { getHazoConnect, appId, adminScope, logger } = opts;

  try {
    const auth = await hazo_get_auth(request as unknown as Parameters<typeof hazo_get_auth>[0], { required_permissions: [adminScope] });
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!auth.permission_ok) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const submission_id = params.id;
    if (!submission_id) {
      return NextResponse.json({ error: 'Missing submission id' }, { status: 400 });
    }

    const adapter = await getHazoConnect();
    const submission_service = create_submission_service(adapter);
    const attachment_service = create_attachment_service(adapter);
    const event_service = create_event_service(adapter);

    const submission = await submission_service.get_submission(submission_id);
    if (!submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    if (submission.app_id !== appId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [attachments, events] = await Promise.all([
      attachment_service.list_for_submission(submission_id),
      event_service.list_for_submission(submission_id),
    ]);

    const markdown = build_prompt(submission, attachments, events);

    await event_service.log_event({
      id: randomUUID(),
      submission_id,
      actor_id: auth.user?.id ?? null,
      event_type: 'exported_prompt',
      from_value: null,
      to_value: null,
      comment: null,
    });

    return new NextResponse(markdown, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  } catch (err) {
    logger?.error('handle_admin_export_prompt: unexpected error', {
      error: String(err),
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
