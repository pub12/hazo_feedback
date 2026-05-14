import 'server-only';
import { createCrudService } from 'hazo_connect/server';
import type { FeedbackAttachment, AttachmentKind } from '../types.js';

const TABLE = 'hazo_feedback_attachments';

interface AttachmentRow extends Record<string, unknown> {
  id: string;
  submission_id: string;
  inline_id: string | null;
  file_id: string;
  mime_type: string;
  size_bytes: number;
  kind: string;
  created_at: string;
}

function row_to_attachment(row: AttachmentRow): FeedbackAttachment {
  return { ...row, kind: row.kind as AttachmentKind };
}

export function create_attachment_service(adapter: unknown) {
  const svc = createCrudService<AttachmentRow>(adapter as Parameters<typeof createCrudService>[0], TABLE, {
    autoId: false,
  });

  async function list_for_submission(submissionId: string): Promise<FeedbackAttachment[]> {
    const rows = await svc.findBy({ submission_id: submissionId });
    return rows.map(row_to_attachment);
  }

  async function insert_attachment(data: Partial<AttachmentRow>): Promise<FeedbackAttachment> {
    const rows = await svc.insert(data);
    return row_to_attachment(rows[0]);
  }

  return { list_for_submission, insert_attachment, raw: svc };
}
