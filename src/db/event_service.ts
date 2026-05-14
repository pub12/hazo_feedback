import 'server-only';
import { createCrudService } from 'hazo_connect/server';
import type { FeedbackEvent, FeedbackEventType } from '../types.js';

const TABLE = 'hazo_feedback_events';

interface EventRow extends Record<string, unknown> {
  id: string;
  submission_id: string;
  actor_id: string | null;
  event_type: string;
  from_value: string | null;
  to_value: string | null;
  comment: string | null;
  created_at: string;
}

function row_to_event(row: EventRow): FeedbackEvent {
  return { ...row, event_type: row.event_type as FeedbackEventType };
}

export function create_event_service(adapter: unknown) {
  const svc = createCrudService<EventRow>(adapter as Parameters<typeof createCrudService>[0], TABLE, {
    autoId: false,
  });

  async function list_for_submission(submissionId: string): Promise<FeedbackEvent[]> {
    const rows = await svc.list((qb) => {
      qb.where('submission_id', 'eq', submissionId);
      qb.order('created_at', 'asc');
      return qb;
    });
    return rows.map(row_to_event);
  }

  async function log_event(data: Omit<EventRow, 'created_at'>): Promise<FeedbackEvent> {
    const rows = await svc.insert({ ...data, created_at: new Date().toISOString() });
    return row_to_event(rows[0]);
  }

  return { list_for_submission, log_event, raw: svc };
}
