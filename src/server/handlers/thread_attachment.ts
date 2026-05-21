import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { hazo_get_auth } from 'hazo_auth/server-lib';
import { readFile } from 'fs/promises';
import { create_submission_service } from '../../db/submission_service.js';
import { create_attachment_service } from '../../db/attachment_service.js';
import { create_event_service } from '../../db/event_service.js';
import type { FileManager } from 'hazo_files';
import type { Logger } from '../../types.js';

interface ThreadAttachmentOptions {
  getHazoConnect: () => Promise<unknown> | unknown;
  getFileManager: () => Promise<unknown> | unknown;
  appId: string;
  adminScope: string;
  logger?: Logger;
}

export async function handle_thread_attachment(
  request: NextRequest,
  params: Record<string, string>,
  opts: ThreadAttachmentOptions,
): Promise<NextResponse> {
  const { getHazoConnect, getFileManager, appId, adminScope, logger } = opts;

  try {
    const auth = await hazo_get_auth(request as unknown as Parameters<typeof hazo_get_auth>[0]);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { refId, attachmentId } = params;
    if (!refId || !attachmentId) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const adapter = await getHazoConnect();
    const submission_service = create_submission_service(adapter);
    const attachment_service = create_attachment_service(adapter);
    const event_service = create_event_service(adapter);

    const submission = await submission_service.get_submission_by_ref(refId);
    if (!submission || submission.app_id !== appId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const is_admin = auth.permissions.includes(adminScope);
    const is_submitter = submission.user_id === auth.user.id;
    if (!is_admin && !is_submitter) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const attachment_row = await attachment_service.raw.findById(attachmentId);
    if (!attachment_row) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
    }

    // Verify this attachment belongs to an event on this submission
    if (attachment_row.event_id) {
      const event = await event_service.raw.findById(attachment_row.event_id as string);
      if (!event || event.submission_id !== submission.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    } else {
      // Submission-anchored attachments are served via the admin endpoint
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const fm = (await getFileManager()) as FileManager;
    const result = await fm.downloadFile(attachment_row.file_id as string);

    if (!result.success || result.data === undefined) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    let buffer: Buffer;
    if (Buffer.isBuffer(result.data)) {
      buffer = result.data;
    } else {
      buffer = await readFile(result.data as string);
    }

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': attachment_row.mime_type as string,
        'Content-Disposition': `inline; filename="${attachment_row.id}"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (err) {
    logger?.error('handle_thread_attachment: unexpected error', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
