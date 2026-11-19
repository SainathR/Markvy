import type { Block } from './blocks';

export interface MdStyle { bullet: '-' | '*' | '+'; emphasis: '*' | '_'; strong: '*' | '_'; fence: '`' | '~'; incrementListMarker: boolean; tablePadding: boolean; setext: boolean }
export const DEFAULT_STYLE: MdStyle = { bullet: '-', emphasis: '*', strong: '*', fence: '`', incrementListMarker: true, tablePadding: true, setext: false };

const count = (text: string, re: RegExp) => (text.match(re) ?? []).length;

/** The commonest choice, or the fallback when the file shows none. */
function pick<T>(counts: [T, number][], fallback: T): T {
  const best = counts.reduce((a, b) => (b[1] > a[1] ? b : a));
  return best[1] > 0 ? best[0] : fallback;
}

export function detectStyle(blocks: Block[], fallback: MdStyle = DEFAULT_STYLE): MdStyle {
  const prose = blocks.filter((b) => !['code', 'mermaid', 'math', 'html', 'frontmatter'].includes(b.kind)).map((b) => b.norm).join('\n');
  const lists = blocks.filter((b) => b.kind === 'list').map((b) => b.norm).join('\n');
  const tables = blocks.filter((b) => b.kind === 'table').map((b) => b.norm).join('\n');
  const fences = blocks.filter((b) => b.kind === 'code' || b.kind === 'mermaid').map((b) => b.norm).join('\n');
  const ordered = [...lists.matchAll(/^\s*(\d+)[.)]\s/gm)].map((m) => m[1]);
  const headings = blocks.filter((b) => b.kind === 'heading');
  const setextHeadings = headings.filter((b) => /\n(=+|-+)[ \t]*\n*$/.test(b.norm)).length;
  const atxHeadings = headings.filter((b) => /^#{1,6}(\s|$)/.test(b.norm)).length;
  return {
    bullet: pick([['-', count(lists, /^\s*-\s/gm)], ['*', count(lists, /^\s*\*\s/gm)], ['+', count(lists, /^\s*\+\s/gm)]], fallback.bullet),
    strong: pick([['*', count(prose, /\*\*[^*\n]+\*\*/g)], ['_', count(prose, /__[^_\n]+__/g)]], fallback.strong),
    emphasis: pick([['*', count(prose, /(?<![*\w])\*[^*\s][^*\n]*\*(?!\*)/g)], ['_', count(prose, /(?<![_\w])_[^_\s][^_\n]*_(?![_\w])/g)]], fallback.emphasis),
    fence: pick([['`', count(fences, /^```/gm)], ['~', count(fences, /^~~~/gm)]], fallback.fence),
    incrementListMarker: ordered.length > 1 ? !ordered.every((n) => n === ordered[0]) : fallback.incrementListMarker,
    tablePadding: tables ? /\|\s[^|\n]*\s\|/.test(tables) : fallback.tablePadding,
    setext: headings.length ? setextHeadings > atxHeadings : fallback.setext,
  };
}

export function stringifyOptions(s: MdStyle): Record<string, unknown> {
  return {
    bullet: s.bullet, emphasis: s.emphasis, strong: s.strong, fence: s.fence,
    incrementListMarker: s.incrementListMarker, tablePipeAlign: s.tablePadding, tableCellPadding: s.tablePadding,
    rule: '-', listItemIndent: 'one', setext: s.setext,
  };
}
