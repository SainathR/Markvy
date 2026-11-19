import { splitBlocks } from './blocks';

export type Merge = { kind: 'clean'; text: string } | { kind: 'clash'; clashes: { mine: string; theirs: string }[] };

/** A block compared by its content (trailing blank lines ignored) but kept with its original text. */
type Piece = { raw: string; key: string; last: boolean };

const pieces = (text: string): Piece[] => {
  const blocks = splitBlocks(text).blocks;
  return blocks.map((x, i) => ({ raw: x.raw, key: x.raw.replace(/(\r?\n)+$/, ''), last: i === blocks.length - 1 }));
};

/** Pairs of matching indexes (longest common subsequence) between two lists. */
function lcs(a: string[], b: string[]): [number, number][] {
  const n = a.length, m = b.length;
  const t = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
  const out: [number, number][] = [];
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (a[i] === b[j]) { out.push([i, j]); i++; j++; } else if (t[i + 1][j] >= t[i][j + 1]) i++; else j++;
  }
  return out;
}

const same = (x: Piece[], y: Piece[]) => x.length === y.length && x.every((p, i) => p.key === y[i].key);
const text = (x: Piece[]) => x.map((p) => p.raw).join('');

/** Index where `needle` appears as a contiguous run in `hay`, or -1. */
function runAt(hay: Piece[], needle: Piece[]): number {
  for (let k = 0; k + needle.length <= hay.length; k++) if (same(hay.slice(k, k + needle.length), needle)) return k;
  return -1;
}

/** Three-way merge over blocks (diff3): stable regions anchor on base blocks both sides kept. */
export function merge3(base: string, theirs: string, mine: string): Merge {
  const [o, a, b] = [base, theirs, mine].map(pieces);
  const ma = new Map(lcs(o.map((p) => p.key), a.map((p) => p.key))), mb = new Map(lcs(o.map((p) => p.key), b.map((p) => p.key)));
  const anchors = o.map((_, i) => i).filter((i) => ma.has(i) && mb.has(i));
  const out: Piece[] = [];
  const clashes: { mine: string; theirs: string }[] = [];
  let pa = 0, pb = 0, po = 0;
  for (const anchor of [...anchors, -1]) {
    const [ea, eb, eo] = anchor < 0 ? [a.length, b.length, o.length] : [ma.get(anchor)!, mb.get(anchor)!, anchor];
    const ab = a.slice(pa, ea), bb = b.slice(pb, eb), ob = o.slice(po, eo);
    if (same(ab, bb) || same(bb, ob)) out.push(...ab);
    else if (same(ab, ob)) out.push(...bb);
    else {
      // One side only inserted blocks around the unchanged base: apply the other side's edit inside.
      const ka = ob.length ? runAt(ab, ob) : -1, kb = ob.length ? runAt(bb, ob) : -1;
      if (ka >= 0) out.push(...ab.slice(0, ka), ...bb, ...ab.slice(ka + ob.length));
      else if (kb >= 0) out.push(...bb.slice(0, kb), ...ab, ...bb.slice(kb + ob.length));
      else if (ob.length && ab.length === ob.length && bb.length === ob.length) {
        // Same number of blocks everywhere: merge position by position, clashing only where both sides edited the same block.
        ob.forEach((o1, i) => {
          const [x, y] = [ab[i], bb[i]];
          if (x.key === o1.key) out.push(y);
          else if (y.key === o1.key || x.key === y.key) out.push(x);
          else { clashes.push({ theirs: x.raw, mine: y.raw }); out.push(y); }
        });
      } else { clashes.push({ theirs: text(ab), mine: text(bb) }); out.push(...bb); }
    }
    if (anchor >= 0) {
      // The side that changed the block's trailing lines wins, so separation stays right.
      const [x, y, z] = [a[ma.get(anchor)!], b[mb.get(anchor)!], o[anchor]];
      out.push(x.raw !== z.raw ? x : y.raw !== z.raw ? y : z);
      pa = ea + 1; pb = eb + 1; po = eo + 1;
    }
  }
  if (clashes.length) return { kind: 'clash', clashes };
  // A block that ended its file has no blank line after it; give it one when more follows.
  const eol = /\r\n/.test(base) ? '\r\n' : '\n';
  const joined = out.map((p, i) => {
    if (!p.last || i === out.length - 1 || /(\r?\n){2}$/.test(p.raw)) return p.raw;
    return p.raw + (/\n$/.test(p.raw) ? eol : eol + eol);
  });
  return { kind: 'clean', text: joined.join('') };
}
