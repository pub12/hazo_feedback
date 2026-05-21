import { describe, it, expect } from '@jest/globals';
import { validate_reply_payload } from '../server/validators/reply_payload.js';

describe('validate_reply_payload', () => {
  it('accepts a well-formed payload', () => {
    const r = validate_reply_payload({ body_html: '<p>Hello</p>', body_text: 'Hello' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.body_html).toBe('<p>Hello</p>');
      expect(r.body_text).toBe('Hello');
    }
  });

  it('rejects missing body_text', () => {
    const r = validate_reply_payload({ body_html: '<p>x</p>', body_text: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/body_text/);
  });

  it('rejects body_text longer than 5000 chars', () => {
    const r = validate_reply_payload({ body_html: '<p>x</p>', body_text: 'x'.repeat(5001) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/5000/);
  });

  it('rejects non-string fields', () => {
    const r = validate_reply_payload({ body_html: 123, body_text: 'x' } as unknown as Record<string, unknown>);
    expect(r.ok).toBe(false);
  });

  it('rejects empty after trim', () => {
    const r = validate_reply_payload({ body_html: '<p>   </p>', body_text: '   ' });
    expect(r.ok).toBe(false);
  });
});
