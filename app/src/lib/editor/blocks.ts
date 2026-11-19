import type { Token } from 'marked';
import { lexBlocks } from '../markdown/parser';

export type BlockKind = 'frontmatter' | 'paragraph' | 'heading' | 'list' | 'table' | 'blockquote' | 'callout' | 'code' | 'mermaid' | 'math' | 'html' | 'hr' | 'opaque';
export interface Block { raw: string; norm: string; kind: BlockKind }
export interface Split { blocks: Block[]; eol: '\n' | '\r\n'; finalNewline: boolean }

const FRONTMATTER = /^---\n[\s\S]*?\n---[ \t]*(?:\n+|$)/;

function kindOf(t: Token): BlockKind {
  switch (t.type) {
    case 'heading': return 'heading';
    case 'paragraph': case 'text': return /^\[\^[^\]]+\]:/.test(t.raw) ? 'opaque' : 'paragraph'; // footnote definitions are cards
    case 'list': return 'list';
    case 'table': return 'table';
    case 'hr': return 'hr';
    case 'html': return 'html';
    case 'mathBlock': return 'math';
    case 'code': return (t as { lang?: string }).lang?.trim().toLowerCase() === 'mermaid' ? 'mermaid' : 'code';
    case 'blockquote': return /^>\s*\[!\w+\]/.test(t.raw) ? 'callout' : 'blockquote';
    default: return 'opaque';
  }
}

/**
 * Splits text into top-level blocks. Each block keeps its exact original characters (line endings included)
 * and the blank lines after it, so joining every `raw` gives back the file byte for byte.
 */
export function splitBlocks(text: string): Split {
  // map[i] = index in `text` of character i of the normalised text (CRLF and CR become LF).
  const map: number[] = [];
  let norm = '';
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\r') {
      map.push(i);
      norm += '\n';
      if (text[i + 1] === '\n') i++;
    } else {
      map.push(i);
      norm += text[i];
    }
  }
  map.push(text.length);
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lf = (text.match(/(?<!\r)\n/g) ?? []).length;
  const eol: Split['eol'] = crlf > lf ? '\r\n' : '\n';

  const spans: { start: number; end: number; kind: BlockKind | 'space' }[] = [];
  let cursor = 0;
  const fm = FRONTMATTER.exec(norm);
  if (fm) { spans.push({ start: 0, end: fm[0].length, kind: 'frontmatter' }); cursor = fm[0].length; }
  for (const t of lexBlocks(norm.slice(cursor))) {
    if (!t.raw) continue;
    let at = norm.startsWith(t.raw, cursor) ? cursor : norm.indexOf(t.raw, cursor);
    if (at < 0) continue; // the lexer rewrote this token; the gap is kept as an opaque block below
    if (at > cursor) spans.push({ start: cursor, end: at, kind: 'opaque' });
    spans.push({ start: at, end: at + t.raw.length, kind: t.type === 'space' ? 'space' : kindOf(t) });
    cursor = at + t.raw.length;
  }
  if (cursor < norm.length) spans.push({ start: cursor, end: norm.length, kind: 'opaque' });

  const blocks: Block[] = [];
  for (const s of spans) {
    const raw = text.slice(map[s.start], map[s.end]);
    const piece = norm.slice(s.start, s.end);
    const last = blocks.at(-1);
    if (s.kind === 'space' && last) { last.raw += raw; last.norm += piece; }
    else blocks.push({ raw, norm: piece, kind: s.kind === 'space' ? 'opaque' : s.kind });
  }
  return { blocks, eol, finalNewline: /\n$/.test(norm) };
}

export const joinRaw = (blocks: Block[]) => blocks.map((b) => b.raw).join('');
