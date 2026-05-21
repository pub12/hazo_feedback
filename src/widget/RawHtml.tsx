'use client';

/**
 * Renders pre-sanitized HTML.
 *
 * SECURITY CONTRACT:
 *   The `html` prop MUST already be sanitized server-side via
 *   `sanitize_body_html` (which wraps `isomorphic-dompurify`).
 *   This component is the ONLY place in hazo_feedback's client
 *   bundle that uses React's raw-HTML escape hatch. Any consumer
 *   of <RawHtml /> implicitly asserts that contract.
 *
 *   If the caller has untrusted HTML, they MUST sanitize it
 *   before passing it here — there is no defense-in-depth in
 *   this component (intentional: a sanitizer would have to be
 *   bundled into the client, blowing up the size).
 */
export function RawHtml({ html, className }: { html: string; className?: string }) {
  // eslint-disable-next-line react/no-danger
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
