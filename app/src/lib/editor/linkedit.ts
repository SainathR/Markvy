import { classifyLink, fileIndex, resolveWiki } from '../markdown/links';
import { splitBlocks } from './blocks';

const CODE_KINDS = new Set(['code', 'mermaid', 'math', 'html', 'frontmatter']);
const WIKI = /\[\[([^\]|#\n]+)(#[^\]|\n]*)?(\|[^\]\n]+)?\]\]/g;
// Inline destination: <...> or bare (one level of balanced parens), then an optional title, then ")".
const MDLINK = /(\]\(\s*)(<[^<>\n]*>|(?:[^\s()<\\]|\\.|\((?:[^\s()\\]|\\.)*\))+)((?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\))/g;
const REFDEF = /^(\s{0,3}\[[^\]]+\]:\s*)(<[^<>\n]*>|\S+)/gm;

/** New location of `path` when `from` (a file or a folder) becomes `to`; null when unaffected. */
function moved(path: string, from: string, to: string): string | null {
  if (path === from) return to;
  if (path.startsWith(from + '/')) return to + path.slice(from.length);
  return null;
}

function relative(fromDoc: string, target: string): string {
  const a = fromDoc.split('/').slice(0, -1), b = target.split('/');
  while (a.length && b.length > 1 && a[0] === b[0]) { a.shift(); b.shift(); }
  return [...a.map(() => '..'), ...b].join('/');
}

/** Applies `fn` to text outside inline code spans. */
function outsideCode(text: string, fn: (s: string) => string): string {
  return text.split(/(`+[^`]*`+)/).map((part, i) => (i % 2 ? part : fn(part))).join('');
}

function rewrite(docPath: string, text: string, paths: string[], from: string, to: string, countAll = false): { text: string; count: number } {
  const files = fileIndex(paths);
  const newDoc = moved(docPath, from, to) ?? docPath;
  let count = 0;
  const href = (raw: string) => {
    const angle = raw.startsWith('<') && raw.endsWith('>');
    const h = angle ? raw.slice(1, -1) : raw;
    const t = classifyLink(h, docPath, files);
    if (t.kind !== 'internal') return raw;
    const dest = moved(t.path, from, to);
    const docMoved = newDoc !== docPath;
    if (!dest && !docMoved) return raw;
    const [, hash = ''] = h.split('#');
    let rel = relative(newDoc, dest ?? t.path);
    if (!angle && (/%/.test(h) || /[\s()<>]/.test(rel))) rel = rel.split('/').map((x) => encodeURIComponent(x).replace(/\(/g, '%28').replace(/\)/g, '%29')).join('/');
    const next = rel + (hash ? `#${hash}` : '');
    if (next === h) return raw;
    count++;
    return angle ? `<${next}>` : next;
  };
  const blocks = splitBlocks(text).blocks.map((b) => {
    if (CODE_KINDS.has(b.kind)) return b.raw;
    return outsideCode(b.raw, (s) =>
      s
        .replace(WIKI, (all, target: string, hash = '', label = '') => {
          const found = resolveWiki(target, paths);
          const dest = found && moved(found, from, to);
          if (!dest) return all;
          const keepExt = /\.(md|markdown|txt)$/i.test(target.trim());
          const full = target.includes('/') ? dest : dest.split('/').pop()!;
          const next = `[[${keepExt ? full : full.replace(/\.(md|markdown|txt)$/i, '')}${hash}${label}]]`;
          if (next === all && !countAll) return all;
          count++;
          return next;
        })
        .replace(MDLINK, (_all, open: string, h: string, close: string) => open + href(h) + close)
        .replace(REFDEF, (_all, lead: string, h: string) => lead + href(h)),
    );
  });
  return { text: blocks.join(''), count };
}

export function planRename(docs: Map<string, string>, from: string, to: string) {
  const paths = [...docs.keys()];
  const out: { path: string; text: string; count: number }[] = [];
  for (const [path, text] of docs) {
    const r = rewrite(path, text, paths, from, to);
    if (r.count && r.text !== text) out.push({ path, text: r.text, count: r.count });
  }
  return out;
}

export function inboundLinks(docs: Map<string, string>, targets: string[]) {
  const paths = [...docs.keys()];
  const gone = (p: string) => targets.some((t) => p === t || p.startsWith(t + '/'));
  const out: { path: string; count: number }[] = [];
  for (const [path, text] of docs) {
    if (gone(path)) continue;
    const r = targets.reduce((n, t) => n + rewrite(path, text, paths, t, `\u0000gone/${t}`, true).count, 0);
    if (r) out.push({ path, count: r });
  }
  return out;
}
