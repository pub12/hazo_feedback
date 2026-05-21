import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { hazo_get_auth } from 'hazo_auth/server-lib';
import { create_submission_service } from '../../db/submission_service.js';
import { create_vote_service } from '../../db/vote_service.js';
import { check_rate_limit } from '../../rate_limit/token_bucket.js';
import { get_feedback_config } from '../../config/load_config.js';
import type { Logger } from '../../types.js';

interface VoteOptions {
  getHazoConnect: () => Promise<unknown> | unknown;
  appId: string;
  logger?: Logger;
}

export async function handle_vote(
  request: NextRequest,
  params: Record<string, string>,
  opts: VoteOptions,
): Promise<NextResponse> {
  const { getHazoConnect, appId, logger } = opts;
  const config = get_feedback_config();

  try {
    const auth = await hazo_get_auth(request as unknown as Parameters<typeof hazo_get_auth>[0]);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = auth.user.id;

    const submissionId = params.submissionId;
    if (!submissionId) return NextResponse.json({ error: 'Missing submissionId' }, { status: 400 });

    const rate_ok = check_rate_limit(`${appId}:vote:${userId}`, config.rateLimitConfig);
    if (!rate_ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    const adapter = await getHazoConnect();
    const submission_service = create_submission_service(adapter);
    const vote_service = create_vote_service(adapter);

    const submission = await submission_service.get_submission(submissionId);
    if (!submission) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (submission.marked_spam) return NextResponse.json({ error: 'Forbidden (spam)' }, { status: 403 });
    if (submission.category !== 'feature') {
      return NextResponse.json({ error: 'Only feature requests are votable' }, { status: 422 });
    }
    if (!submission.is_public) {
      return NextResponse.json({ error: 'Submission is not public' }, { status: 403 });
    }

    const result = await vote_service.toggle_vote(submissionId, userId);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    logger?.error('handle_vote: unexpected error', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
