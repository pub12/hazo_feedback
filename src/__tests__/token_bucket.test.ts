import { jest, beforeEach, afterEach, describe, it, expect } from '@jest/globals';
import { check_rate_limit, reset_rate_limits } from '../rate_limit/token_bucket.js';
import type { RateLimitConfig } from '../types.js';

const cfg: RateLimitConfig = {
  perAnonCount: 3,
  perAnonWindowMs: 60_000,
  perUserCount: 5,
  perUserWindowMs: 3_600_000,
  perIpCount: 10,
  perIpWindowMs: 60_000,
};

// Key format mirrors what the production code looks for:
// key includes ':anon:', ':user:', or ':ip:' to select the right bucket config.
const ANON_KEY = 'fb:anon:sess-abc';
const USER_KEY = 'fb:user:user-42';
const IP_KEY = 'fb:ip:192.168.1.1';

beforeEach(() => {
  reset_rate_limits();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('check_rate_limit — anonymous key', () => {
  it('allows the first N (perAnonCount) calls', () => {
    for (let i = 0; i < cfg.perAnonCount; i++) {
      expect(check_rate_limit(ANON_KEY, cfg)).toBe(true);
    }
  });

  it('rejects the (perAnonCount + 1)th call', () => {
    for (let i = 0; i < cfg.perAnonCount; i++) {
      check_rate_limit(ANON_KEY, cfg);
    }
    expect(check_rate_limit(ANON_KEY, cfg)).toBe(false);
  });

  it('continues to reject beyond the limit', () => {
    for (let i = 0; i < cfg.perAnonCount + 5; i++) {
      check_rate_limit(ANON_KEY, cfg);
    }
    expect(check_rate_limit(ANON_KEY, cfg)).toBe(false);
  });
});

describe('check_rate_limit — user key', () => {
  it('allows the first N (perUserCount) calls', () => {
    for (let i = 0; i < cfg.perUserCount; i++) {
      expect(check_rate_limit(USER_KEY, cfg)).toBe(true);
    }
  });

  it('rejects the (perUserCount + 1)th call', () => {
    for (let i = 0; i < cfg.perUserCount; i++) {
      check_rate_limit(USER_KEY, cfg);
    }
    expect(check_rate_limit(USER_KEY, cfg)).toBe(false);
  });
});

describe('check_rate_limit — IP key', () => {
  it('allows the first N (perIpCount) calls', () => {
    for (let i = 0; i < cfg.perIpCount; i++) {
      expect(check_rate_limit(IP_KEY, cfg)).toBe(true);
    }
  });

  it('rejects the (perIpCount + 1)th call', () => {
    for (let i = 0; i < cfg.perIpCount; i++) {
      check_rate_limit(IP_KEY, cfg);
    }
    expect(check_rate_limit(IP_KEY, cfg)).toBe(false);
  });
});

describe('check_rate_limit — window expiry', () => {
  it('resets the anon count after perAnonWindowMs elapses', () => {
    jest.useFakeTimers();

    // Exhaust the limit
    for (let i = 0; i < cfg.perAnonCount; i++) {
      check_rate_limit(ANON_KEY, cfg);
    }
    expect(check_rate_limit(ANON_KEY, cfg)).toBe(false);

    // Advance past the window
    jest.advanceTimersByTime(cfg.perAnonWindowMs + 1);

    // Now a new call should start a fresh window and be allowed
    expect(check_rate_limit(ANON_KEY, cfg)).toBe(true);
  });

  it('resets the user count after perUserWindowMs elapses', () => {
    jest.useFakeTimers();

    for (let i = 0; i < cfg.perUserCount; i++) {
      check_rate_limit(USER_KEY, cfg);
    }
    expect(check_rate_limit(USER_KEY, cfg)).toBe(false);

    jest.advanceTimersByTime(cfg.perUserWindowMs + 1);

    expect(check_rate_limit(USER_KEY, cfg)).toBe(true);
  });

  it('resets the IP count after perIpWindowMs elapses', () => {
    jest.useFakeTimers();

    for (let i = 0; i < cfg.perIpCount; i++) {
      check_rate_limit(IP_KEY, cfg);
    }
    expect(check_rate_limit(IP_KEY, cfg)).toBe(false);

    jest.advanceTimersByTime(cfg.perIpWindowMs + 1);

    expect(check_rate_limit(IP_KEY, cfg)).toBe(true);
  });

  it('does not reset early — (windowMs - 1) ms is not enough', () => {
    jest.useFakeTimers();

    for (let i = 0; i < cfg.perAnonCount; i++) {
      check_rate_limit(ANON_KEY, cfg);
    }

    jest.advanceTimersByTime(cfg.perAnonWindowMs - 1);

    // Still within the window — should be rejected
    expect(check_rate_limit(ANON_KEY, cfg)).toBe(false);
  });
});

describe('check_rate_limit — key isolation', () => {
  it('anon and user keys have independent buckets', () => {
    // Exhaust anon
    for (let i = 0; i < cfg.perAnonCount; i++) {
      check_rate_limit(ANON_KEY, cfg);
    }
    // User key should still be available
    expect(check_rate_limit(USER_KEY, cfg)).toBe(true);
  });

  it('two different user keys have independent buckets', () => {
    const key1 = 'fb:user:user-1';
    const key2 = 'fb:user:user-2';

    for (let i = 0; i < cfg.perUserCount; i++) {
      check_rate_limit(key1, cfg);
    }
    expect(check_rate_limit(key1, cfg)).toBe(false);
    expect(check_rate_limit(key2, cfg)).toBe(true);
  });
});

describe('reset_rate_limits', () => {
  it('clears all buckets so previously exhausted keys are allowed again', () => {
    for (let i = 0; i < cfg.perAnonCount; i++) {
      check_rate_limit(ANON_KEY, cfg);
    }
    expect(check_rate_limit(ANON_KEY, cfg)).toBe(false);

    reset_rate_limits();

    expect(check_rate_limit(ANON_KEY, cfg)).toBe(true);
  });

  it('clears multiple keys at once', () => {
    for (let i = 0; i < cfg.perAnonCount; i++) {
      check_rate_limit(ANON_KEY, cfg);
    }
    for (let i = 0; i < cfg.perIpCount; i++) {
      check_rate_limit(IP_KEY, cfg);
    }

    reset_rate_limits();

    expect(check_rate_limit(ANON_KEY, cfg)).toBe(true);
    expect(check_rate_limit(IP_KEY, cfg)).toBe(true);
  });
});
