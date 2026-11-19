import DOMPurify from 'dompurify';

/** Documents are untrusted. Removes scripts, event handlers, unsafe URLs, frames, forms and inline styles. */
export function sanitize(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOW_DATA_ATTR: true,
    FORBID_TAGS: ['style', 'form', 'iframe', 'object', 'embed', 'video', 'audio', 'source', 'picture', 'track', 'image', 'use'],
    FORBID_ATTR: ['style', 'id', 'srcset', 'poster', 'background'],
  });
}
