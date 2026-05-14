import DOMPurify from 'isomorphic-dompurify';

const ALLOWED_TAGS = [
  'b', 'strong', 'i', 'em', 'u', 'a', 'p', 'br',
  'ul', 'ol', 'li', 'code', 'pre', 'blockquote',
  'h2', 'h3', 'img',
];

// Flat list of allowed attributes across all tags.
// Per-element restrictions are enforced in hooks below.
const ALLOWED_ATTR = ['href', 'target', 'rel', 'src', 'alt', 'data-feedback-inline-id', 'class'];

export function sanitize_body_html(
  html: string,
  attachmentMap: Map<string, string>
): string {
  // Hook 1: afterSanitizeAttributes — force target + rel on every <a> element.
  const anchor_hook = (node: Element) => {
    if (node.tagName !== 'A') return;
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  };

  // Hook 2: afterSanitizeElements — rewrite or remove <img> elements based on attachmentMap.
  // Use nodeType === 1 (ELEMENT_NODE) instead of `instanceof Element` — the latter
  // references a browser-only global and throws on Node.js even with jsdom.
  const img_hook = (node: Node) => {
    const el = node as Element;
    if (node.nodeType !== 1 || el.tagName !== 'IMG') return;

    const inlineId = el.getAttribute('data-feedback-inline-id');

    if (!inlineId) {
      node.parentNode?.removeChild(node);
      return;
    }

    const resolvedSrc = attachmentMap.get(inlineId);

    if (!resolvedSrc) {
      node.parentNode?.removeChild(node);
      return;
    }

    el.setAttribute('src', resolvedSrc);
  };

  DOMPurify.addHook('afterSanitizeAttributes', anchor_hook);
  DOMPurify.addHook('afterSanitizeElements', img_hook);

  try {
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      FORCE_BODY: true,
    });
  } finally {
    DOMPurify.removeHook('afterSanitizeAttributes', anchor_hook);
    DOMPurify.removeHook('afterSanitizeElements', img_hook);
  }
}
