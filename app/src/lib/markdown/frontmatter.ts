export type Frontmatter = Record<string, string | string[]>;

const unquote = (s: string) => s.replace(/^["']|["']$/g, '');

export function splitFrontmatter(text: string): { frontmatter: Frontmatter; body: string } {
  const m = /^---\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!m) return { frontmatter: {}, body: text };
  const block = m[1] ?? '';
  // Leading horizontal rules are not frontmatter unless the block is empty or has a "key:" line.
  if (block !== '' && !block.split(/\r?\n/).some((l) => /^[A-Za-z0-9_-]+:/.test(l))) {
    return { frontmatter: {}, body: text };
  }
  const frontmatter: Frontmatter = {};
  for (const line of block.split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const raw = kv[2].trim();
    frontmatter[kv[1]] = /^\[.*\]$/.test(raw)
      ? raw.slice(1, -1).split(',').map((x) => unquote(x.trim())).filter(Boolean)
      : unquote(raw);
  }
  return { frontmatter, body: text.slice(m[0].length) };
}
