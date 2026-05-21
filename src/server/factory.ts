import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import type { FeedbackServerOptions, FeedbackServer } from '../types.js';
import { get_feedback_config } from '../config/load_config.js';
import { handle_submit } from './handlers/submit.js';
import { handle_admin_list } from './handlers/admin_list.js';
import { handle_admin_detail } from './handlers/admin_detail.js';
import { handle_admin_update } from './handlers/admin_update.js';
import { handle_admin_comment } from './handlers/admin_comment.js';
import { handle_admin_reply } from './handlers/admin_reply.js';
import { handle_user_reply } from './handlers/user_reply.js';
import { handle_thread } from './handlers/thread.js';
import { handle_admin_export_prompt } from './handlers/admin_export_prompt.js';
import { handle_admin_attachment } from './handlers/admin_attachment.js';
import { handle_vote } from './handlers/vote.js';
import { handle_public_board } from './handlers/public_board.js';
import { handle_admin_voters } from './handlers/admin_voters.js';
import { extract_feedback_path, match_route } from './router.js';

// ─── Shared options builder ───────────────────────────────────────────────────

/**
 * Merges caller-supplied options with values from the config file.
 * Caller-supplied appId / adminScope always take precedence.
 */
function resolve_options(options: FeedbackServerOptions): {
  appId: string;
  adminScope: string;
  getHazoConnect: () => Promise<unknown> | unknown;
  getFileManager: () => Promise<unknown> | unknown;
  notifyOptions: FeedbackServerOptions['notifyOptions'];
  threadUrlBuilder: FeedbackServerOptions['threadUrlBuilder'];
  listAdminsForBroadcast: FeedbackServerOptions['listAdminsForBroadcast'];
  logger: FeedbackServerOptions['logger'];
} {
  const config = get_feedback_config();
  return {
    appId:         options.appId        ?? config.appId,
    adminScope:    options.adminScope   ?? config.adminScope,
    getHazoConnect: options.getHazoConnect,
    getFileManager: options.getFileManager,
    notifyOptions:  options.notifyOptions,
    threadUrlBuilder:       options.threadUrlBuilder,
    listAdminsForBroadcast: options.listAdminsForBroadcast,
    logger:         options.logger,
  };
}

// ─── Route table ─────────────────────────────────────────────────────────────

type ResolvedOpts = ReturnType<typeof resolve_options>;

type RouteEntry =
  | {
      method: 'POST';
      pattern: string[];
      handler: (request: NextRequest, params: Record<string, string>, opts: ResolvedOpts) => Promise<NextResponse>;
    }
  | {
      method: 'GET';
      pattern: string[];
      handler: (request: NextRequest, params: Record<string, string>, opts: ResolvedOpts) => Promise<NextResponse>;
    }
  | {
      method: 'PATCH';
      pattern: string[];
      handler: (request: NextRequest, params: Record<string, string>, opts: ResolvedOpts) => Promise<NextResponse>;
    };

/**
 * Submit does not take `params` — wrap it to match the common signature.
 */
function wrap_submit(opts: ResolvedOpts) {
  return (request: NextRequest, _params: Record<string, string>): Promise<NextResponse> =>
    handle_submit(request, {
      getHazoConnect:   opts.getHazoConnect,
      getFileManager:   opts.getFileManager,
      appId:            opts.appId,
      adminScope:       opts.adminScope,
      notifyOptions:    opts.notifyOptions,
      threadUrlBuilder: opts.threadUrlBuilder,
      logger:           opts.logger,
    });
}

function make_admin_base_opts(opts: ResolvedOpts) {
  return {
    getHazoConnect: opts.getHazoConnect,
    appId:          opts.appId,
    adminScope:     opts.adminScope,
    logger:         opts.logger,
  };
}

function make_admin_file_opts(opts: ResolvedOpts) {
  return {
    ...make_admin_base_opts(opts),
    getFileManager: opts.getFileManager,
  };
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createFeedbackServer(options: FeedbackServerOptions): FeedbackServer {
  const resolved = resolve_options(options);

  /**
   * Dispatch a single request to the correct handler by matching the HTTP
   * method and the path segments extracted after `feedback/`.
   */
  async function dispatch(request: NextRequest): Promise<NextResponse> {
    const segments = extract_feedback_path(request.url);
    const method   = request.method.toUpperCase();

    // ── POST /submit ──────────────────────────────────────────────────────────
    if (method === 'POST') {
      const params = match_route(segments, ['submit']);
      if (params !== null) {
        return wrap_submit(resolved)(request, params);
      }

      // ── POST /vote/:submissionId ──────────────────────────────────────────────
      const vote_params = match_route(segments, ['vote', ':submissionId']);
      if (vote_params !== null) {
        return handle_vote(request, vote_params, {
          getHazoConnect: resolved.getHazoConnect,
          appId:          resolved.appId,
          logger:         resolved.logger,
        });
      }

      // ── POST /admin/:id/comment ───────────────────────────────────────────
      const comment_params = match_route(segments, ['admin', ':id', 'comment']);
      if (comment_params !== null) {
        return handle_admin_comment(request, comment_params, make_admin_base_opts(resolved));
      }

      const admin_reply_params = match_route(segments, ['admin', ':id', 'reply']);
      if (admin_reply_params !== null) {
        return handle_admin_reply(request, admin_reply_params, {
          getHazoConnect:   resolved.getHazoConnect,
          getFileManager:   resolved.getFileManager,
          appId:            resolved.appId,
          adminScope:       resolved.adminScope,
          threadUrlBuilder: resolved.threadUrlBuilder,
          notifyOptions:    resolved.notifyOptions
            ? { from: resolved.notifyOptions.from, fromName: resolved.notifyOptions.fromName }
            : undefined,
          logger:           resolved.logger,
        });
      }

      const user_reply_params = match_route(segments, ['thread', ':refId', 'reply']);
      if (user_reply_params !== null) {
        return handle_user_reply(request, user_reply_params, {
          getHazoConnect:         resolved.getHazoConnect,
          getFileManager:         resolved.getFileManager,
          appId:                  resolved.appId,
          adminScope:             resolved.adminScope,
          threadUrlBuilder:       resolved.threadUrlBuilder,
          notifyOptions:          resolved.notifyOptions
            ? { from: resolved.notifyOptions.from, fromName: resolved.notifyOptions.fromName }
            : undefined,
          listAdminsForBroadcast: resolved.listAdminsForBroadcast,
          logger:                 resolved.logger,
        });
      }
    }

    // ── GET routes ────────────────────────────────────────────────────────────
    if (method === 'GET') {
      // GET /thread/:refId
      const thread_params = match_route(segments, ['thread', ':refId']);
      if (thread_params !== null) {
        return handle_thread(request, thread_params, {
          getHazoConnect: resolved.getHazoConnect,
          appId:          resolved.appId,
          adminScope:     resolved.adminScope,
          logger:         resolved.logger,
        });
      }

      // GET /public-board
      const board_params = match_route(segments, ['public-board']);
      if (board_params !== null) {
        return handle_public_board(request, board_params, {
          getHazoConnect: resolved.getHazoConnect,
          appId:          resolved.appId,
          logger:         resolved.logger,
        });
      }

      // GET /admin/attachment/:attachmentId — must be checked before GET /admin/:id
      const attachment_params = match_route(segments, ['admin', 'attachment', ':attachmentId']);
      if (attachment_params !== null) {
        return handle_admin_attachment(request, attachment_params, make_admin_file_opts(resolved));
      }

      // GET /admin/list
      const list_params = match_route(segments, ['admin', 'list']);
      if (list_params !== null) {
        return handle_admin_list(request, list_params, make_admin_base_opts(resolved));
      }

      // GET /admin/:id/export-prompt
      const export_params = match_route(segments, ['admin', ':id', 'export-prompt']);
      if (export_params !== null) {
        return handle_admin_export_prompt(request, export_params, make_admin_file_opts(resolved));
      }

      // GET /admin/:id/voters — must be checked before GET /admin/:id
      const voters_params = match_route(segments, ['admin', ':id', 'voters']);
      if (voters_params !== null) {
        return handle_admin_voters(request, voters_params, {
          getHazoConnect: resolved.getHazoConnect,
          adminScope:     resolved.adminScope,
          logger:         resolved.logger,
        });
      }

      // GET /admin/:id
      const detail_params = match_route(segments, ['admin', ':id']);
      if (detail_params !== null) {
        return handle_admin_detail(request, detail_params, make_admin_base_opts(resolved));
      }
    }

    // ── PATCH /admin/:id ──────────────────────────────────────────────────────
    if (method === 'PATCH') {
      const update_params = match_route(segments, ['admin', ':id']);
      if (update_params !== null) {
        return handle_admin_update(request, update_params, make_admin_base_opts(resolved));
      }
    }

    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return {
    handlers: {
      GET:    (request, _context) => dispatch(request as NextRequest),
      POST:   (request, _context) => dispatch(request as NextRequest),
      PATCH:  (request, _context) => dispatch(request as NextRequest),
      DELETE: (_request, _context) =>
        Promise.resolve(NextResponse.json({ error: 'Not found' }, { status: 404 })),
    },
  };
}
