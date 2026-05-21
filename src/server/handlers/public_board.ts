import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { hazo_get_auth } from 'hazo_auth/server-lib';
import { create_submission_service } from '../../db/submission_service.js';
import { create_vote_service } from '../../db/vote_service.js';
import type { Logger } from '../../types.js';

interface BoardOptions {
  getHazoConnect: () => Promise<unknown> | unknown;
  appId: string;
  logger?: Logger;
}

const PREVIEW_CHARS = 500;

export async function handle_public_board(
  request: NextRequest,
  _params: Record<string, string>,
  opts: BoardOptions,
): Promise<NextResponse> {
  const { getHazoConnect, appId, logger } = opts;
  try {
    const auth = await hazo_get_auth(request as unknown as Parameters<typeof hazo_get_auth>[0]);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = auth.user.id;

    const url = new URL(request.url);
    const sp = url.searchParams;
    const rawPage = parseInt(sp.get('page') ?? '1', 10);
    const page = isNaN(rawPage) ? 1 : Math.max(rawPage, 1);
    const rawSize = parseInt(sp.get('pageSize') ?? '20', 10);
    const pageSize = isNaN(rawSize) ? 20 : Math.min(Math.max(rawSize, 1), 100);
    const sort: 'top' | 'new' = sp.get('sort') === 'new' ? 'new' : 'top';

    const adapter = await getHazoConnect();
    const submission_service = create_submission_service(adapter);
    const vote_service = create_vote_service(adapter);

    const all = await submission_service.list_submissions({
      appId,
      category: 'feature',
      isPublic: true,
      limit: 1000,
    });

    const ids = all.map((s) => s.id);
    const counts = await vote_service.count_votes_for(ids);
    const voted_set = await vote_service.user_voted_for(ids, userId);

    const enriched = all.map((s) => ({
      ...s,
      vote_count: counts.get(s.id) ?? 0,
      voted_by_me: voted_set.has(s.id),
    }));

    enriched.sort((a, b) => {
      if (sort === 'top' && b.vote_count !== a.vote_count) {
        return b.vote_count - a.vote_count;
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    const total = enriched.length;
    const start = (page - 1) * pageSize;
    const items = enriched.slice(start, start + pageSize).map((s) => ({
      id: s.id,
      ref_id: s.ref_id,
      subject: s.subject,
      body_text_preview: (s.body_text ?? '').slice(0, PREVIEW_CHARS),
      category: s.category,
      status: s.status,
      created_at: s.created_at,
      vote_count: s.vote_count,
      voted_by_me: s.voted_by_me,
    }));

    return NextResponse.json({ items, total, page, pageSize, sort });
  } catch (err) {
    logger?.error('handle_public_board: unexpected error', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
