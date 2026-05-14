import 'server-only';

/**
 * Extracts the path segments that follow the `feedback/` segment in a URL.
 *
 * Example:
 *   '/api/feedback/submit'        → ['submit']
 *   '/api/feedback/admin/list'    → ['admin', 'list']
 *   '/api/feedback/admin/abc/comment' → ['admin', 'abc', 'comment']
 */
export function extract_feedback_path(url: string): string[] {
  const parsed = new URL(url, 'http://localhost');
  const pathname = parsed.pathname;

  const marker = 'feedback/';
  const idx = pathname.indexOf(marker);
  if (idx === -1) {
    return [];
  }

  const after = pathname.slice(idx + marker.length);
  if (!after) {
    return [];
  }

  return after.split('/').filter(Boolean);
}

/**
 * Matches URL path segments against a route pattern.
 *
 * Pattern segments that start with `:` are named parameters. All other
 * segments must match exactly (case-sensitive). Returns a map of param
 * name → value on success, or null when the segments do not match.
 *
 * Example:
 *   match_route(['admin', 'abc123'], ['admin', ':id'])  → { id: 'abc123' }
 *   match_route(['admin', 'list'],   ['admin', 'list']) → {}
 *   match_route(['submit'],          ['admin', ':id'])  → null
 */
export function match_route(
  segments: string[],
  pattern: string[]
): Record<string, string> | null {
  if (segments.length !== pattern.length) {
    return null;
  }

  const params: Record<string, string> = {};

  for (let i = 0; i < pattern.length; i++) {
    const part = pattern[i];
    const seg = segments[i];

    if (part.startsWith(':')) {
      params[part.slice(1)] = seg;
    } else if (part !== seg) {
      return null;
    }
  }

  return params;
}
