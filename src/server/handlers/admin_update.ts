import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { hazo_get_auth } from 'hazo_auth/server-lib';
import { create_submission_service } from '../../db/submission_service.js';
import { create_event_service } from '../../db/event_service.js';
import type { FeedbackStatus, FeedbackPriority, Logger } from '../../types.js';

interface AdminHandlerOptions {
  getHazoConnect: () => Promise<unknown> | unknown;
  appId: string;
  adminScope: string;
  logger?: Logger;
}

const VALID_STATUSES: FeedbackStatus[] = ['new', 'triaged', 'in_progress', 'resolved', 'wont_fix'];
const VALID_PRIORITIES: FeedbackPriority[] = ['low', 'medium', 'high', 'urgent'];

export async function handle_admin_update(
  request: NextRequest,
  params: Record<string, string>,
  opts: AdminHandlerOptions
): Promise<NextResponse> {
  const { getHazoConnect, adminScope, logger } = opts;

  try {
    const auth = await hazo_get_auth(request as unknown as Parameters<typeof hazo_get_auth>[0], { required_permissions: [adminScope] });
    if (!auth.authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!auth.permission_ok) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const id = params.id;
    if (!id) {
      return NextResponse.json({ error: 'Missing submission id' }, { status: 400 });
    }

    let body: { status?: unknown; priority?: unknown; marked_spam?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    // Validate status
    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status as FeedbackStatus)) {
        return NextResponse.json(
          {
            error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
          },
          { status: 400 }
        );
      }
    }

    // Validate priority (allow null to clear it)
    if (body.priority !== undefined && body.priority !== null) {
      if (!VALID_PRIORITIES.includes(body.priority as FeedbackPriority)) {
        return NextResponse.json(
          {
            error: `Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')} or null`,
          },
          { status: 400 }
        );
      }
    }

    const adapter = await getHazoConnect();
    const submission_service = create_submission_service(adapter);
    const event_service = create_event_service(adapter);

    const existing = await submission_service.get_submission(id);
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Build patch object
    const patch: Record<string, unknown> = {};
    const actor_id: string = (auth.user as { id: string })?.id ?? null;

    if (body.status !== undefined) {
      patch.status = body.status as FeedbackStatus;
    }
    if (body.priority !== undefined) {
      patch.priority = (body.priority as FeedbackPriority | null) ?? null;
    }
    if (body.marked_spam !== undefined) {
      patch.marked_spam = Boolean(body.marked_spam);
    }

    // Handle resolved_at transitions
    const new_status = patch.status as FeedbackStatus | undefined;
    if (new_status !== undefined) {
      if (new_status === 'resolved' && existing.status !== 'resolved') {
        patch.resolved_at = new Date().toISOString();
      } else if (new_status !== 'resolved' && existing.status === 'resolved') {
        patch.resolved_at = null;
      }
    }

    const submission = await submission_service.update_submission(id, patch);

    // Log events for each changed field
    const event_promises: Promise<unknown>[] = [];

    if (patch.status !== undefined && patch.status !== existing.status) {
      event_promises.push(
        event_service.log_event({
          id: crypto.randomUUID(),
          submission_id: id,
          actor_id,
          event_type: 'status_changed',
          from_value: existing.status,
          to_value: patch.status as string,
          comment: null,
        })
      );
    }

    if (patch.priority !== undefined && patch.priority !== existing.priority) {
      event_promises.push(
        event_service.log_event({
          id: crypto.randomUUID(),
          submission_id: id,
          actor_id,
          event_type: 'priority_changed',
          from_value: existing.priority ?? null,
          to_value: (patch.priority as string | null) ?? null,
          comment: null,
        })
      );
    }

    if (patch.marked_spam !== undefined && Boolean(patch.marked_spam) !== existing.marked_spam) {
      event_promises.push(
        event_service.log_event({
          id: crypto.randomUUID(),
          submission_id: id,
          actor_id,
          event_type: 'status_changed',
          from_value: `spam:${existing.marked_spam}`,
          to_value: `spam:${Boolean(patch.marked_spam)}`,
          comment: null,
        })
      );
    }

    await Promise.all(event_promises);

    return NextResponse.json({ submission });
  } catch (err) {
    logger?.error('handle_admin_update: unexpected error', {
      error: String(err),
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
