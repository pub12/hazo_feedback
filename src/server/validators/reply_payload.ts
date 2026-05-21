export type ReplyPayloadResult =
  | { ok: true; body_html: string; body_text: string }
  | { ok: false; error: string };

const MAX_BODY_TEXT = 5000;

export function validate_reply_payload(input: unknown): ReplyPayloadResult {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'body must be a JSON object' };
  }
  const obj = input as Record<string, unknown>;
  const body_html = obj.body_html;
  const body_text = obj.body_text;
  if (typeof body_html !== 'string') return { ok: false, error: 'body_html must be a string' };
  if (typeof body_text !== 'string') return { ok: false, error: 'body_text must be a string' };
  if (body_text.trim().length === 0) return { ok: false, error: 'body_text must not be empty' };
  if (body_text.length > MAX_BODY_TEXT) {
    return { ok: false, error: `body_text exceeds 5000 chars (got ${body_text.length})` };
  }
  return { ok: true, body_html, body_text };
}
