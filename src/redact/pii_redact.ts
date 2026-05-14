import type { BreadcrumbEntry } from '../types.js';

// Key patterns that trigger redaction (case-insensitive)
const PII_PATTERNS = [
  /password/i,
  /passwd/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /auth/i,
  /credit[_-]?card/i,
  /card[_-]?number/i,
  /cvv/i,
  /ssn/i,
  /social[_-]?security/i,
  /\bphone\b/i,
  /\bemail\b/i,
  /\baddress\b/i,
  /\bdob\b/i,
  /birth[_-]?date/i,
  /\bssn\b/i,
  /private/i,
  /\bpin\b/i,
];

function is_pii_key(key: string): boolean {
  return PII_PATTERNS.some((pattern) => pattern.test(key));
}

export function redact_context(
  ctx: Record<string, unknown>
): { redacted: Record<string, unknown>; keys: string[] } {
  const redacted: Record<string, unknown> = { ...ctx };
  const keys: string[] = [];

  for (const key of Object.keys(redacted)) {
    if (is_pii_key(key)) {
      redacted[key] = '[REDACTED]';
      keys.push(key);
    } else if (
      redacted[key] !== null &&
      typeof redacted[key] === 'object' &&
      !Array.isArray(redacted[key])
    ) {
      const nested = redacted[key] as Record<string, unknown>;
      const nestedCopy: Record<string, unknown> = { ...nested };
      let mutated = false;

      for (const nestedKey of Object.keys(nestedCopy)) {
        if (is_pii_key(nestedKey)) {
          nestedCopy[nestedKey] = '[REDACTED]';
          keys.push(`${key}.${nestedKey}`);
          mutated = true;
        }
      }

      if (mutated) {
        redacted[key] = nestedCopy;
      }
    }
  }

  return { redacted, keys };
}

export function redact_breadcrumbs(entries: BreadcrumbEntry[]): BreadcrumbEntry[] {
  return entries.map((entry) => {
    if (!entry.data) {
      return entry;
    }

    const dataCopy: Record<string, unknown> = { ...entry.data };
    let mutated = false;

    for (const key of Object.keys(dataCopy)) {
      if (is_pii_key(key)) {
        dataCopy[key] = '[REDACTED]';
        mutated = true;
      }
    }

    if (!mutated) {
      return entry;
    }

    return { ...entry, data: dataCopy };
  });
}
