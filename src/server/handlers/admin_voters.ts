import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { hazo_get_auth } from 'hazo_auth/server-lib';
import { create_vote_service } from '../../db/vote_service.js';
import type { Logger } from '../../types.js';

interface VotersOptions {
  getHazoConnect: () => Promise<unknown> | unknown;
  adminScope: string;
  logger?: Logger;
}

export async function handle_admin_voters(
  request: NextRequest,
  params: Record<string, string>,
  opts: VotersOptions,
): Promise<NextResponse> {
  const { getHazoConnect, adminScope, logger } = opts;
  try {
    const auth = await hazo_get_auth(
      request as unknown as Parameters<typeof hazo_get_auth>[0],
      { required_permissions: [adminScope] },
    );
    if (!auth.authenticated) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!auth.permission_ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const id = params.id;
    if (!id) return NextResponse.json({ error: 'Missing submission id' }, { status: 400 });

    const url = new URL(request.url);
    const sp = url.searchParams;
    const rawPage = parseInt(sp.get('page') ?? '1', 10);
    const page = isNaN(rawPage) ? 1 : Math.max(rawPage, 1);
    const rawSize = parseInt(sp.get('pageSize') ?? '50', 10);
    const pageSize = isNaN(rawSize) ? 50 : Math.min(Math.max(rawSize, 1), 100);

    const adapter = await getHazoConnect();
    const vote_service = create_vote_service(adapter);

    const total = await vote_service.count_votes(id);
    const voters = await vote_service.list_voters(id, {
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });

    return NextResponse.json({ items: voters, total, page, pageSize });
  } catch (err) {
    logger?.error('handle_admin_voters: unexpected error', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
