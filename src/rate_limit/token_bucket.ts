import type { RateLimitConfig } from '../types.js';

interface BucketState {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, BucketState>();

function resolve_limit_and_window(
  key: string,
  config: RateLimitConfig
): { limit: number; windowMs: number } {
  if (key.includes(':anon:')) {
    return { limit: config.perAnonCount, windowMs: config.perAnonWindowMs };
  }
  if (key.includes(':user:')) {
    return { limit: config.perUserCount, windowMs: config.perUserWindowMs };
  }
  // :ip:
  return { limit: config.perIpCount, windowMs: config.perIpWindowMs };
}

export function check_rate_limit(key: string, config: RateLimitConfig): boolean {
  const { limit, windowMs } = resolve_limit_and_window(key, config);
  const now = Date.now();

  let state = buckets.get(key);

  if (!state || now - state.windowStart > windowMs) {
    state = { count: 0, windowStart: now };
  }

  state.count += 1;
  buckets.set(key, state);

  return state.count <= limit;
}

export function reset_rate_limits(): void {
  buckets.clear();
}
