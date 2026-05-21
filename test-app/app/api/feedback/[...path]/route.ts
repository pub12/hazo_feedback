import 'server-only';
export const runtime = 'nodejs';

import { NextRequest } from 'next/server';
import { createFeedbackServer } from 'hazo_feedback';
import { get_hazo_connect_instance } from 'hazo_auth/server-lib';

// Singleton server instance — created once per process, not per request
let _server: ReturnType<typeof createFeedbackServer> | null = null;

function getFeedbackServer(): ReturnType<typeof createFeedbackServer> {
  if (_server) return _server;

  // Share hazo_auth's singleton so admin permission lookups and feedback
  // submissions hit the same SQLite DB. The path comes from
  // config/hazo_auth_config.ini → [hazo_connect].sqlite_path.
  const getHazoConnect = () => get_hazo_connect_instance();

  const getFileManager = async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createFileManager } = require('hazo_files');
    const fm = createFileManager({
      config: {
        provider: 'local',
        local: { basePath: './test-uploads' },
      },
    });
    await fm.initialize();
    return fm;
  };

  const consoleLogger = {
    info:  (msg: string, data?: Record<string, unknown>) => console.log('[hazo_feedback]', msg, data ?? ''),
    warn:  (msg: string, data?: Record<string, unknown>) => console.warn('[hazo_feedback]', msg, data ?? ''),
    error: (msg: string, data?: Record<string, unknown>) => console.error('[hazo_feedback]', msg, data ?? ''),
  };

  _server = createFeedbackServer({
    getHazoConnect,
    getFileManager,
    appId: 'test-app',
    adminScope: 'hazo_feedback:test-app:admin',
    notifyOptions: {
      getHazoConnect,
      from: 'feedback@example.com',
      fromName: 'hazo_feedback Test',
    },
    logger: consoleLogger,
  });

  return _server;
}

export async function GET(req: NextRequest, ctx: unknown) {
  return getFeedbackServer().handlers.GET(req, ctx);
}

export async function POST(req: NextRequest, ctx: unknown) {
  return getFeedbackServer().handlers.POST(req, ctx);
}

export async function PATCH(req: NextRequest, ctx: unknown) {
  return getFeedbackServer().handlers.PATCH(req, ctx);
}

export async function DELETE(req: NextRequest, ctx: unknown) {
  return getFeedbackServer().handlers.DELETE(req, ctx);
}
