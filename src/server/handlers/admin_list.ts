import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { hazo_get_auth } from 'hazo_auth/server-lib';
import { create_submission_service } from '../../db/submission_service.js';
import { create_vote_service } from '../../db/vote_service.js';
import type { FeedbackStatus, FeedbackCategory, Logger } from '../../types.js';

interface AdminHandlerOptions {
  getHazoConnect: () => Promise<unknown> | unknown;
  appId: string;
  adminScope: string;
  logger?: Logger;
}

export async function handle_admin_list(
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

    const url = new URL(request.url);
    const sp = url.searchParams;

    const status = sp.get('status') as FeedbackStatus | null;
    const category = sp.get('category') as FeedbackCategory | null;
    const source = sp.get('source') ?? undefined;
    const search = sp.get('search') ?? undefined;

    const marked_spam_raw = sp.get('marked_spam');
    const markedSpam =
      marked_spam_raw === 'true' ? true : marked_spam_raw === 'false' ? false : undefined;

    const rawLimit = parseInt(sp.get('limit') ?? '50', 10);
    const limit = isNaN(rawLimit) ? 50 : Math.min(Math.max(rawLimit, 1), 200);

    const rawOffset = parseInt(sp.get('offset') ?? '0', 10);
    const offset = isNaN(rawOffset) ? 0 : Math.max(rawOffset, 0);

    const adapter = await getHazoConnect();
    const service = create_submission_service(adapter);

    const submissions = await service.list_submissions({
      appId,
      status: status ?? undefined,
      category: category ?? undefined,
      source,
      markedSpam,
      search,
      limit,
      offset,
    });

    const vote_service = create_vote_service(adapter);
    const ids = submissions.map((s) => s.id);
    const counts = await vote_service.count_votes_for(ids);
    const augmented = submissions.map((s) => ({ ...s, vote_count: counts.get(s.id) ?? 0 }));

    return NextResponse.json({ submissions: augmented });
  } catch (err) {
    logger?.error('handle_admin_list: unexpected error', {
      error: String(err),
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
