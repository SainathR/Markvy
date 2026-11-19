import { Marked, type TokenizerAndRendererExtension } from 'marked';

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const startAt = (needle: string) => (src: string) => {
  const i = src.indexOf(needle);
  return i < 0 ? undefined : i;
};

const wiki: TokenizerAndRendererExtension = {
  name: 'wiki',
  level: 'inline',
  start: startAt('[['),
  tokenizer(src) {
    const m = /^\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/.exec(src);
    return m ? { type: 'wiki', raw: m[0], target: m[1].trim(), label: (m[2] ?? m[1]).trim() } : undefined;
  },
  renderer: (t) => `<a href="#" data-wiki="${esc(t.target)}">${esc(t.label)}</a>`,
};

const mathBlock: TokenizerAndRendererExtension = {
  name: 'mathBlock',
  level: 'block',
  start: startAt('$$'),
  tokenizer(src) {
    const m = /^\$\$[ \t]*\n([\s\S]*?)\n[ \t]*\$\$[ \t]*(?:\n+|$)/.exec(src);
    return m ? { type: 'mathBlock', raw: m[0], text: m[1].trim() } : undefined;
  },
  renderer: (t) => `<div class="math math-block" data-tex="${esc(t.text)}">${esc(t.text)}</div>`,
};

const mathInline: TokenizerAndRendererExtension = {
  name: 'mathInline',
  level: 'inline',
  start: startAt('$'),
  tokenizer(src) {
    // No space just inside the dollars, and no digit right after the closing one: "$5 and $10" stays text.
    const m = /^\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\d)/.exec(src);
    return m ? { type: 'mathInline', raw: m[0], text: m[1] } : undefined;
  },
  renderer: (t) => `<span class="math" data-tex="${esc(t.text)}">${esc(t.text)}</span>`,
};

const marked = new Marked({ gfm: true }, { extensions: [wiki, mathBlock, mathInline] });
export const lexBlocks = (md: string) => marked.lexer(md);

export const toHtml = (markdown: string): string => marked.parse(markdown, { async: false }) as string;
