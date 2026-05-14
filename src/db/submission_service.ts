import 'server-only';
import { createCrudService } from 'hazo_connect/server';
import type { CrudService } from 'hazo_connect/server';
import type { FeedbackSubmission, FeedbackStatus, FeedbackPriority, FeedbackCategory } from '../types.js';

const TABLE = 'hazo_feedback_submissions';

export interface SubmissionRow extends Record<string, unknown> {
  id: string;
  ref_id: string;
  app_id: string;
  source: string | null;
  user_id: string | null;
  user_name_snapshot: string | null;
  user_email_snapshot: string | null;
  anon_session_id: string | null;
  category: string;
  subject: string | null;
  problem: string | null;
  intent: string | null;
  expected_output: string | null;
  reproducibility: string | null;
  body_html: string | null;
  body_text: string | null;
  status: string;
  priority: string | null;
  marked_spam: boolean | number;
  url: string;
  route: string | null;
  viewport_w: number | null;
  viewport_h: number | null;
  user_agent: string | null;
  app_version: string | null;
  consumer_context: unknown;
  consumer_context_redacted: string | null;
  recent_errors: unknown;
  breadcrumbs: unknown;
  attachment_count: number;
  acknowledge_email_sent_at: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

function row_to_submission(row: SubmissionRow): FeedbackSubmission {
  return {
    ...row,
    category: row.category as FeedbackCategory,
    status: row.status as FeedbackStatus,
    priority: row.priority as FeedbackPriority | null,
    reproducibility: row.reproducibility as 'always' | 'sometimes' | 'once' | null,
    marked_spam: Boolean(row.marked_spam),
    consumer_context_redacted: row.consumer_context_redacted
      ? JSON.parse(row.consumer_context_redacted)
      : null,
    consumer_context:
      typeof row.consumer_context === 'string'
        ? JSON.parse(row.consumer_context)
        : (row.consumer_context as Record<string, unknown> | null),
    recent_errors:
      typeof row.recent_errors === 'string'
        ? JSON.parse(row.recent_errors)
        : (row.recent_errors as unknown[] | null),
    breadcrumbs:
      typeof row.breadcrumbs === 'string'
        ? JSON.parse(row.breadcrumbs)
        : (row.breadcrumbs as import('../types.js').BreadcrumbEntry[] | null),
  };
}

export interface ListSubmissionsOptions {
  appId: string;
  status?: FeedbackStatus;
  category?: FeedbackCategory;
  source?: string;
  markedSpam?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

export function create_submission_service(adapter: unknown) {
  const svc = createCrudService<SubmissionRow>(adapter as Parameters<typeof createCrudService>[0], TABLE, {
    autoId: false,
  });

  async function list_submissions(opts: ListSubmissionsOptions): Promise<FeedbackSubmission[]> {
    const rows = await svc.list((qb) => {
      qb.where('app_id', 'eq', opts.appId);
      if (opts.status) qb.where('status', 'eq', opts.status);
      if (opts.category) qb.where('category', 'eq', opts.category);
      if (opts.source) qb.where('source', 'eq', opts.source);
      if (opts.markedSpam !== undefined) qb.where('marked_spam', 'eq', opts.markedSpam ? 1 : 0);
      if (opts.search) {
        qb.where('ref_id', 'ilike', `%${opts.search}%`);
      }
      qb.order('created_at', 'desc');
      if (opts.limit) qb.limit(opts.limit);
      if (opts.offset) qb.offset(opts.offset);
      return qb;
    });
    return rows.map(row_to_submission);
  }

  async function get_submission(id: string): Promise<FeedbackSubmission | null> {
    const row = await svc.findById(id);
    return row ? row_to_submission(row) : null;
  }

  async function get_submission_by_ref(refId: string): Promise<FeedbackSubmission | null> {
    const row = await svc.findOneBy({ ref_id: refId });
    return row ? row_to_submission(row) : null;
  }

  async function insert_submission(data: Partial<SubmissionRow>): Promise<FeedbackSubmission> {
    const rows = await svc.insert(data);
    return row_to_submission(rows[0]);
  }

  async function update_submission(id: string, patch: Partial<SubmissionRow>): Promise<FeedbackSubmission> {
    const rows = await svc.updateById(id, { ...patch, updated_at: new Date().toISOString() });
    return row_to_submission(rows[0]);
  }

  return {
    list_submissions,
    get_submission,
    get_submission_by_ref,
    insert_submission,
    update_submission,
    raw: svc,
  };
}
