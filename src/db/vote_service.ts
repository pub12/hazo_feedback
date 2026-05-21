import 'server-only';
import { randomUUID } from 'crypto';
import { createCrudService } from 'hazo_connect/server';
import type { FeedbackVote } from '../types.js';

const TABLE = 'hazo_feedback_votes';

interface VoteRow extends Record<string, unknown> {
  id: string;
  submission_id: string;
  user_id: string;
  created_at: string;
}

function row_to_vote(row: VoteRow): FeedbackVote {
  return {
    id: row.id,
    submission_id: row.submission_id,
    user_id: row.user_id,
    created_at: row.created_at,
  };
}

export function create_vote_service(adapter: unknown) {
  const svc = createCrudService<VoteRow>(adapter as Parameters<typeof createCrudService>[0], TABLE, {
    autoId: false,
  });

  async function has_voted(submissionId: string, userId: string): Promise<boolean> {
    const existing = await svc.findOneBy({ submission_id: submissionId, user_id: userId });
    return existing !== null;
  }

  async function count_votes(submissionId: string): Promise<number> {
    const rows = await svc.list((qb) => {
      qb.where('submission_id', 'eq', submissionId);
      return qb;
    });
    return rows.length;
  }

  async function count_votes_for(submissionIds: string[]): Promise<Map<string, number>> {
    if (submissionIds.length === 0) return new Map();
    const rows = await svc.list((qb) => {
      qb.where('submission_id', 'in', submissionIds);
      return qb;
    });
    const out = new Map<string, number>();
    for (const r of rows) out.set(r.submission_id, (out.get(r.submission_id) ?? 0) + 1);
    return out;
  }

  async function user_voted_for(submissionIds: string[], userId: string): Promise<Set<string>> {
    if (submissionIds.length === 0) return new Set();
    const rows = await svc.list((qb) => {
      qb.where('submission_id', 'in', submissionIds);
      qb.where('user_id', 'eq', userId);
      return qb;
    });
    return new Set(rows.map((r) => r.submission_id));
  }

  async function list_voters(submissionId: string, opts: { limit: number; offset: number }): Promise<FeedbackVote[]> {
    const rows = await svc.list((qb) => {
      qb.where('submission_id', 'eq', submissionId);
      qb.order('created_at', 'asc');
      qb.limit(opts.limit);
      qb.offset(opts.offset);
      return qb;
    });
    return rows.map(row_to_vote);
  }

  async function toggle_vote(submissionId: string, userId: string): Promise<{ voted: boolean; count: number }> {
    const existing = await svc.findOneBy({ submission_id: submissionId, user_id: userId });
    if (existing) {
      await svc.deleteById(existing.id);
      const count = await count_votes(submissionId);
      return { voted: false, count };
    } else {
      await svc.insert({
        id: randomUUID(),
        submission_id: submissionId,
        user_id: userId,
        created_at: new Date().toISOString(),
      });
      const count = await count_votes(submissionId);
      return { voted: true, count };
    }
  }

  return {
    has_voted,
    count_votes,
    count_votes_for,
    user_voted_for,
    list_voters,
    toggle_vote,
    raw: svc,
  };
}
