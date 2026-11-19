import { slugify } from './slug';

export type LinkTarget =
  | { kind: 'external'; url: string }
  | { kind: 'anchor'; slug: string }
  | { kind: 'internal'; path: string; slug: string }
  | { kind: 'broken'; target: string }
  | { kind: 'refused'; url: string };

export interface FileIndex { has(path: string): string | null }

export function fileIndex(paths: Iterable<string>): FileIndex {
  const byLower = new Map<string, string>();
  for (const p of paths) byLower.set(p.toLowerCase(), p);
  return { has: (p) => byLower.get(p.toLowerCase()) ?? null };
}

export const safeDecode = (s: string) => {
  try { return decodeURIComponent(s); } catch { return s; }
};

export function resolvePath(from: string, rel: string): string {
  const parts = rel.startsWith('/') ? [] : from.split('/').slice(0, -1);
  for (const seg of rel.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') parts.pop(); else parts.push(seg);
  }
  return parts.join('/');
}

const DOC = /\.(md|markdown|txt)$/i;

export function classifyLink(href: string, from: string, files: FileIndex): LinkTarget {
  if (/^(https?:|mailto:)/i.test(href)) return { kind: 'external', url: href };
  if (href.startsWith('#')) return { kind: 'anchor', slug: slugify(safeDecode(href.slice(1))) };
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return { kind: 'refused', url: href };
  const [rawPath, hash = ''] = href.split('#');
  const rel = safeDecode(rawPath).replace(/\\/g, '/');
  const target = resolvePath(from, rel);
  // Only documents open in the reader; an image or other file that exists is still not a page.
  const found = [target, `${target}.md`, `${target}/README.md`, `${target}/index.md`].map((p) => files.has(p)).find((p) => p !== null && DOC.test(p)) ?? null;
  return found ? { kind: 'internal', path: found, slug: slugify(safeDecode(hash)) } : { kind: 'broken', target: rel || href };
}

const norm = (s: string) => s.toLowerCase().replace(DOC, '').replace(/[-_\s]+/g, ' ').trim();

/** Wiki names match a document's file name or path. Plan 3 adds matching by title once the search index knows titles. */
export function resolveWiki(name: string, paths: Iterable<string>): string | null {
  const wanted = norm(name);
  for (const p of paths) {
    if (!DOC.test(p)) continue;
    if (norm(p.split('/').pop()!) === wanted || norm(p) === wanted) return p;
  }
  return null;
}
