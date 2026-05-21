const MAX_BODY_HTML = 100_000;

export type ReplyBodyResult =
  | { ok: true; body_html: string }
  | { ok: false; error: string };

function has_content(html: string): boolean {
  return html.replace(/<[^>]*>/g, '').trim().length > 0 || /<img/i.test(html);
}

export function validate_reply_body_html(body_html: string): ReplyBodyResult {
  if (typeof body_html !== 'string') return { ok: false, error: 'body_html must be a string' };
  if (!has_content(body_html)) return { ok: false, error: 'body_html must not be empty' };
  if (body_html.length > MAX_BODY_HTML) {
    return { ok: false, error: `body_html exceeds max length (${body_html.length} chars, max ${MAX_BODY_HTML})` };
  }
  return { ok: true, body_html };
}
