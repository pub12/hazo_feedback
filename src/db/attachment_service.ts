import 'server-only';
import { createCrudService } from 'hazo_connect/server';
import type { FeedbackAttachment, AttachmentKind } from '../types.js';

const TABLE = 'hazo_feedback_attachments';

interface AttachmentRow extends Record<string, unknown> {
  id: string;
  submission_id: string | null;
  event_id: string | null;
  inline_id: string | null;
  file_id: string;
  mime_type: string;
  size_bytes: number;
  kind: string;
  created_at: string;
}

function row_to_attachment(row: AttachmentRow): FeedbackAttachment {
  return {
    id: row.id,
    submission_id: row.submission_id,
    event_id: row.event_id,
    inline_id: row.inline_id,
    file_id: row.file_id,
    mime_type: row.mime_type,
    size_bytes: row.size_bytes,
    kind: row.kind as AttachmentKind,
    created_at: row.created_at,
  };
}

export function create_attachment_service(adapter: unknown) {
  const svc = createCrudService<AttachmentRow>(adapter as Parameters<typeof createCrudService>[0], TABLE, {
    autoId: false,
  });

  async function list_for_submission(submissionId: string): Promise<FeedbackAttachment[]> {
    const rows = await svc.findBy({ submission_id: submissionId });
    return rows.map(row_to_attachment);
  }

  async function list_for_event(eventId: string): Promise<FeedbackAttachment[]> {
    const rows = await svc.list((qb) => {
      qb.where('event_id', 'eq', eventId);
      qb.order('created_at', 'asc');
      return qb;
    });
    return rows.map(row_to_attachment);
  }

  async function insert_submission_attachment(data: {
    id: string;
    submission_id: string;
    inline_id: string | null;
    file_id: string;
    mime_type: string;
    size_bytes: number;
    kind: AttachmentKind;
    created_at: string;
  }): Promise<FeedbackAttachment> {
    const rows = await svc.insert({ ...data, event_id: null });
    return row_to_attachment(rows[0]);
  }

  async function insert_event_attachment(data: {
    id: string;
    event_id: string;
    inline_id: string | null;
    file_id: string;
    mime_type: string;
    size_bytes: number;
    kind: AttachmentKind;
    created_at: string;
  }): Promise<FeedbackAttachment> {
    const rows = await svc.insert({ ...data, submission_id: null });
    return row_to_attachment(rows[0]);
  }

  return { list_for_submission, list_for_event, insert_submission_attachment, insert_event_attachment, raw: svc };
}
