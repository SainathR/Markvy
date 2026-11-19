import type { SearchResult } from './core';
import { docKey } from './library';

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const WORD = '[\\p{L}\\p{N}_]';

/** Matches a query as the core's search does: ignoring case, optionally whole words. `words` matches any single word. */
export function matcher(q: string, wholeWords: boolean, words = false): RegExp | null {
  const parts = words ? q.trim().split(/\s+/).filter(Boolean) : [q.trim()];
  if (!parts[0]) return null;
  const wrap = (p: string) => (wholeWords ? `(?<!${WORD})${escape(p)}(?!${WORD})` : escape(p));
  return new RegExp(parts.map(wrap).join('|'), 'giu');
}

export interface Segment { text: string; hit: boolean }

/** Splits text into plain and matching parts, for rendering with <mark> (never as HTML). */
export function highlight(text: string, q: string, wholeWords: boolean): Segment[] {
  const re = matcher(q, wholeWords, true);
  if (!re) return [{ text, hit: false }];
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), hit: false });
    out.push({ text: m[0], hit: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), hit: false });
  return out;
}

export interface Suggestion { key: string; slug: string | null; label: string; sub: string; icon: 'file' | 'hash' }

/** The search box's list: documents whose title matches, then sections whose heading matches. */
export function suggestionsFrom(results: SearchResult[], collectionName: (id: string) => string, max = 6): Suggestion[] {
  const docs = results.filter((r) => r.titleMatch).map((r): Suggestion => ({
    key: docKey(r.collectionId, r.path), slug: null, label: r.title, sub: `${collectionName(r.collectionId)} › ${r.path}`, icon: 'file',
  }));
  const sections = results.flatMap((r) => r.hits.filter((h) => h.headingMatch && h.level >= 2).map((h): Suggestion => ({
    key: docKey(r.collectionId, r.path), slug: h.slug, label: h.heading, sub: `Section in ${r.title}`, icon: 'hash',
  })));
  return [...docs, ...sections].slice(0, max);
}
