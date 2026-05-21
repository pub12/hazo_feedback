import { describe, it, expect } from '@jest/globals';
import { validate_reply_body_html } from '../server/validators/reply_payload.js';

describe('validate_reply_body_html', () => {
  it('accepts well-formed HTML', () => {
    const r = validate_reply_body_html('<p>Hello</p>');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.body_html).toBe('<p>Hello</p>');
  });

  it('accepts HTML with only an image', () => {
    const r = validate_reply_body_html('<p><img data-feedback-inline-id="abc" src="uuid-123"/></p>');
    expect(r.ok).toBe(true);
  });

  it('rejects empty string', () => {
    const r = validate_reply_body_html('');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/empty/);
  });

  it('rejects HTML that is only tags with no content', () => {
    const r = validate_reply_body_html('<p>   </p>');
    expect(r.ok).toBe(false);
  });

  it('rejects non-string', () => {
    const r = validate_reply_body_html(123 as unknown as string);
    expect(r.ok).toBe(false);
  });

  it('rejects oversized body', () => {
    const r = validate_reply_body_html('<p>' + 'x'.repeat(100_001) + '</p>');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/exceeds/);
  });
});
