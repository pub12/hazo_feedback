import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { hazo_get_auth } from 'hazo_auth/server-lib';
import { readFile } from 'fs/promises';
import { create_submission_service } from '../../db/submission_service.js';
import { create_attachment_service } from '../../db/attachment_service.js';
import type { FileManager } from 'hazo_files';
import type { Logger } from '../../types.js';

interface AdminHandlerOptions {
  getHazoConnect: () => Promise<unknown> | unknown;
  getFileManager: () => Promise<unknown> | unknown;
  appId: string;
  adminScope: string;
  logger?: Logger;
}

export async function handle_admin_attachment(
  request: NextRequest,
  params: Record<string, string>,
  opts: AdminHandlerOptions
): Promise<NextResponse> {
  const { getHazoConnect, getFileManager, appId, adminScope, logger } = opts;

  try {
    const auth = await hazo_get_auth(request as unknown as Parameters<typeof hazo_get_auth>[0], { required_permissions: [adminScope] });
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!auth.permission_ok) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const attachment_id = params.attachmentId;
    if (!attachment_id) {
      return NextResponse.json({ error: 'Missing attachmentId' }, { status: 400 });
    }

    const adapter = await getHazoConnect();
    const attachment_service = create_attachment_service(adapter);
    const submission_service = create_submission_service(adapter);

    const attachment_row = await attachment_service.raw.findById(attachment_id);
    if (!attachment_row) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
    }

    const submission = await submission_service.get_submission(attachment_row.submission_id as string);
    if (!submission || submission.app_id !== appId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
      // result.data is a local file path string
      buffer = await readFile(result.data as string);
    }

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': attachment_row.mime_type as string,
        'Content-Disposition': `attachment; filename="${attachment_row.id}"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (err) {
    logger?.error('handle_admin_attachment: unexpected error', {
      error: String(err),
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
