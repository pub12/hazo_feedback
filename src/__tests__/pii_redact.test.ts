import { redact_context, redact_breadcrumbs } from '../redact/pii_redact.js';
import type { BreadcrumbEntry } from '../types.js';

describe('redact_context', () => {
  describe('top-level PII key redaction', () => {
    it('replaces the value of a key matching "password" with [REDACTED]', () => {
      const ctx = { password: 'hunter2', name: 'Alice' };
      const { redacted } = redact_context(ctx);
      expect(redacted.password).toBe('[REDACTED]');
    });

    it('adds the redacted key name to the returned keys array', () => {
      const ctx = { password: 'hunter2' };
      const { keys } = redact_context(ctx);
      expect(keys).toContain('password');
    });

    it('leaves a non-matching key like "name" untouched', () => {
      const ctx = { name: 'Alice', password: 'secret' };
      const { redacted } = redact_context(ctx);
      expect(redacted.name).toBe('Alice');
    });

    it('does not add non-matching keys to the keys array', () => {
      const ctx = { name: 'Alice', username: 'alice99' };
      const { keys } = redact_context(ctx);
      expect(keys).not.toContain('name');
      expect(keys).not.toContain('username');
    });

    it('redacts keys matching "token"', () => {
      const ctx = { token: 'abc123' };
      const { redacted, keys } = redact_context(ctx);
      expect(redacted.token).toBe('[REDACTED]');
      expect(keys).toContain('token');
    });

    it('redacts keys matching "apiKey" (camelCase variant)', () => {
      const ctx = { apiKey: 'sk-xxx' };
      const { redacted, keys } = redact_context(ctx);
      expect(redacted.apiKey).toBe('[REDACTED]');
      expect(keys).toContain('apiKey');
    });

    it('returns an empty keys array when nothing is redacted', () => {
      const ctx = { role: 'admin', plan: 'pro' };
      const { keys } = redact_context(ctx);
      expect(keys).toHaveLength(0);
    });
  });

  describe('nested object redaction', () => {
    it('redacts a matching key inside a nested object value', () => {
      const ctx = { credentials: { token: 'xyz', userId: 'u1' } };
      const { redacted } = redact_context(ctx);
      const nested = redacted.credentials as Record<string, unknown>;
      expect(nested.token).toBe('[REDACTED]');
    });

    it('adds "parent.key" to the keys array for nested redactions', () => {
      const ctx = { credentials: { token: 'xyz' } };
      const { keys } = redact_context(ctx);
      expect(keys).toContain('credentials.token');
    });

    it('leaves non-matching keys inside a nested object untouched', () => {
      const ctx = { credentials: { token: 'xyz', userId: 'u1' } };
      const { redacted } = redact_context(ctx);
      const nested = redacted.credentials as Record<string, unknown>;
      expect(nested.userId).toBe('u1');
    });

    it('does not add non-matching nested keys to the keys array', () => {
      const ctx = { session: { token: 'abc', plan: 'free' } };
      const { keys } = redact_context(ctx);
      expect(keys).not.toContain('session.plan');
    });
  });

  describe('immutability', () => {
    it('does not mutate the original object for top-level redactions', () => {
      const ctx = { password: 'hunter2', name: 'Alice' };
      const original_password = ctx.password;
      redact_context(ctx);
      expect(ctx.password).toBe(original_password);
    });

    it('does not mutate the original object for nested redactions', () => {
      const nested = { token: 'orig' };
      const ctx = { auth: nested };
      redact_context(ctx);
      expect(nested.token).toBe('orig');
    });

    it('original context reference is strictly unchanged', () => {
      const ctx = { password: 'pw', info: { secret: 'shh' } };
      redact_context(ctx);
      expect(ctx).toStrictEqual({ password: 'pw', info: { secret: 'shh' } });
    });
  });

  describe('edge cases', () => {
    it('returns an empty redacted object and empty keys for an empty input', () => {
      const { redacted, keys } = redact_context({});
      expect(redacted).toEqual({});
      expect(keys).toHaveLength(0);
    });

    it('skips null values without throwing', () => {
      const ctx = { data: null } as unknown as Record<string, unknown>;
      expect(() => redact_context(ctx)).not.toThrow();
    });

    it('skips array values without treating them as nested objects', () => {
      const ctx = { tags: ['a', 'b'] };
      const { redacted } = redact_context(ctx as Record<string, unknown>);
      expect(redacted.tags).toEqual(['a', 'b']);
    });
  });
});

describe('redact_breadcrumbs', () => {
  describe('entries without data', () => {
    it('returns an entry without a data field as-is', () => {
      const entry: BreadcrumbEntry = { type: 'navigation', message: 'click', timestamp: 1000 };
      const result = redact_breadcrumbs([entry]);
      expect(result[0]).toBe(entry); // same reference
    });

    it('returns an entry with data: undefined as-is', () => {
      const entry: BreadcrumbEntry = {
        type: 'ui',
        message: 'hover',
        timestamp: 2000,
        data: undefined,
      };
      const result = redact_breadcrumbs([entry]);
      expect(result[0]).toBe(entry);
    });
  });

  describe('entries with PII data', () => {
    it('redacts a matching key like "authToken" inside entry.data', () => {
      const entry: BreadcrumbEntry = {
        type: 'http',
        message: 'request',
        timestamp: 3000,
        data: { authToken: 'tok123', method: 'POST' },
      };
      const result = redact_breadcrumbs([entry]);
      expect(result[0].data!.authToken).toBe('[REDACTED]');
    });

    it('leaves non-matching data keys like "userId" untouched', () => {
      const entry: BreadcrumbEntry = {
        type: 'http',
        message: 'request',
        timestamp: 4000,
        data: { userId: 'u42', method: 'GET' },
      };
      const result = redact_breadcrumbs([entry]);
      expect(result[0].data!.userId).toBe('u42');
    });

    it('returns a new entry object (not the same reference) when data is mutated', () => {
      const entry: BreadcrumbEntry = {
        type: 'http',
        message: 'login',
        timestamp: 5000,
        data: { password: 'pw' },
      };
      const result = redact_breadcrumbs([entry]);
      expect(result[0]).not.toBe(entry);
    });

    it('returns the same entry reference when no redaction is needed', () => {
      const entry: BreadcrumbEntry = {
        type: 'ui',
        message: 'click',
        timestamp: 6000,
        data: { buttonId: 'save' },
      };
      const result = redact_breadcrumbs([entry]);
      expect(result[0]).toBe(entry);
    });
  });

  describe('immutability', () => {
    it('does not mutate the original entry when data contains PII', () => {
      const entry: BreadcrumbEntry = {
        type: 'http',
        message: 'auth',
        timestamp: 7000,
        data: { token: 'secret', route: '/login' },
      };
      redact_breadcrumbs([entry]);
      expect(entry.data!.token).toBe('secret');
    });

    it('does not mutate the original entries array', () => {
      const entries: BreadcrumbEntry[] = [
        { type: 'nav', message: 'page view', timestamp: 8000, data: { password: 'pw' } },
      ];
      const original_length = entries.length;
      redact_breadcrumbs(entries);
      expect(entries).toHaveLength(original_length);
      expect(entries[0].data!.password).toBe('pw');
    });
  });

  describe('mixed entries', () => {
    it('processes multiple entries independently', () => {
      const entries: BreadcrumbEntry[] = [
        { type: 'nav', message: 'go', timestamp: 1, data: { token: 'abc' } },
        { type: 'ui', message: 'click', timestamp: 2 },
        { type: 'http', message: 'fetch', timestamp: 3, data: { url: '/api' } },
      ];
      const result = redact_breadcrumbs(entries);
      expect(result[0].data!.token).toBe('[REDACTED]');
      expect(result[1]).toBe(entries[1]);
      expect(result[2]).toBe(entries[2]);
    });
  });

  describe('edge cases', () => {
    it('returns an empty array for empty input', () => {
      expect(redact_breadcrumbs([])).toEqual([]);
    });
  });
});
