/**
 * Next.js instrumentation hook — runs once per server process before any
 * request handlers.
 *
 * Responsibilities:
 *   1. Wire hazo_notify inbox storage to the same SQLite adapter that
 *      hazo_auth uses (so dispatch() can write hazo_notify_inbox rows).
 *   2. Register a stub email channel adapter so dispatch() passes channel
 *      validation and writes inbox + delivery rows without attempting real
 *      email delivery.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { get_hazo_connect_instance } = await import('hazo_auth/server-lib');
  const { initInbox } = await import('hazo_notify/inbox');
  const { registerChannel, getChannel } = await import('hazo_notify/channels');

  // ── 1. Init inbox storage ────────────────────────────────────────────────
  try {
    await initInbox({ adapter_factory: () => get_hazo_connect_instance() });
    console.log('[instrumentation] hazo_notify inbox initialised');
  } catch (err) {
    console.error('[instrumentation] initInbox failed:', err);
  }

  // ── 2. Register stub email adapter (no real delivery) ────────────────────
  // Guard against double-registration across dev-mode HMR cycles.
  if (!getChannel('email')) {
    registerChannel({
      capabilities: {
        channel_id: 'email',
        display_name: 'Email (test stub)',
        template_body_keys: ['html', 'text'],
        max_text_length: null,
        splits_long_messages: false,
        supports_explicit_recipient: true,
        retry: {
          max_attempts: 0,
          backoff_ms: () => 0,
        },
      },
      validate(payload: Record<string, unknown>) {
        // Mirror EmailChannel.validate: require subject + body or template_name.
        const p = payload as { subject?: string; body_text?: string; body_html?: string; template_name?: string };
        const errors: string[] = [];
        if (!p.subject && !p.template_name) errors.push('subject or template_name required');
        if (!p.body_text && !p.body_html && !p.template_name) errors.push('body_text, body_html, or template_name required');
        return errors.length > 0 ? { ok: false, errors } : { ok: true };
      },
      async send(_payload: Record<string, unknown>, ctx: { inbox_id: string; recipient: string }) {
        console.log('[instrumentation] stub email send — no-op', { inbox_id: ctx.inbox_id, to: ctx.recipient });
        return { ok: true, message_id: `stub-${Date.now()}` };
      },
    });
    console.log('[instrumentation] stub email channel registered');
  }
}
