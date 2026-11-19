import type { Node as PMNode } from '@milkdown/kit/prose/model';
import { splitBlocks, type BlockKind, type Split } from './blocks';
import type { Codec } from './codec';

export const CARD_KINDS: BlockKind[] = ['frontmatter', 'callout', 'mermaid', 'math', 'html', 'opaque'];

export interface Loaded { doc: PMNode; split: Split; origin: PMNode[][] }

const same = (a: PMNode[], b: PMNode[]) => a.length === b.length && a.every((n, i) => n.eq(b[i]));

const escapes = (md: string) => (md.match(/\\[[\]*_$]/g) ?? []).length;

/**
 * Nodes for each block, or a card when the editor can't represent it exactly: parse → serialize → parse must agree,
 * and serializing must not add escapes (a block parsed alone turns `[docs][ref]` and `[^1]` into literal text).
 * Blocks are parsed many at a time (`parseMany`), each with the result it would have alone. A block that serializes
 * back to its own text (blank lines at its end aside) needs no second parse: the same text parses to the same nodes.
 * Only HTML can hold blank lines at the end of a document, so a block with `<` always gets the second parse.
 */
export function load(text: string, codec: Codec): Loaded {
  const split = splitBlocks(text);
  const editable = split.blocks.filter((b) => !CARD_KINDS.includes(b.kind));
  const parsed = codec.parseMany(editable.map((b) => b.norm));
  const md = parsed.map((nodes) => (nodes.length ? codec.serialize(nodes) : ''));
  const recheck = editable.map((_, i) => i).filter((i) => md[i] !== editable[i].norm.replace(/\n*$/, '\n') || md[i].includes('<'));
  const again = new Map(codec.parseMany(recheck.map((i) => md[i])).map((nodes, k) => [recheck[k], nodes]));
  const ok = (i: number) => !again.has(i) || (escapes(md[i]) <= escapes(editable[i].norm) && same(parsed[i], again.get(i)!));
  let i = 0;
  const origin = split.blocks.map((b) => {
    if (CARD_KINDS.includes(b.kind)) return [codec.card(b.norm, b.kind)];
    const nodes = parsed[i];
    if (!nodes.length) { i++; return [codec.card(b.norm, 'opaque')]; }
    return ok(i++) ? nodes : [codec.card(b.norm, b.kind)];
  });
  return { doc: codec.doc(origin.flat()), split, origin };
}

/**
 * Untouched blocks (their nodes are the very same objects, in order) are written as they were read.
 * Everything else is serialized in the file's style and line ending. Anything that no longer follows its
 * original predecessor starts after a blank line, so neighbours never merge.
 */
export function toMarkdown(doc: PMNode, loaded: Loaded, codec: Codec): string {
  const kids: PMNode[] = [];
  doc.forEach((n) => kids.push(n));
  const owner = new Map<PMNode, number>();
  loaded.origin.forEach((nodes, b) => nodes.forEach((n) => owner.set(n, b)));
  const { blocks, eol, finalNewline } = loaded.split;
  let out = '';
  let prev = -1; // original index of the last block written as read; -2 after a serialized run
  let run: PMNode[] = [];
  const gap = () => { while (out && !/\n\n$/.test(out.replace(/\r\n/g, '\n'))) out += eol; };
  const flush = () => {
    if (!run.length) return;
    gap();
    out += codec.serialize(run).replace(/\n+$/, '\n').replace(/\n/g, eol);
    run = [];
    prev = -2;
  };
  for (let i = 0; i < kids.length; ) {
    const b = owner.get(kids[i]);
    const group = b === undefined ? null : loaded.origin[b];
    if (group && group[0] === kids[i] && group.every((n, k) => kids[i + k] === n)) {
      flush();
      if (b !== prev + 1) gap();
      out += blocks[b!].raw;
      prev = b!;
      i += group.length;
    } else {
      run.push(kids[i]);
      i++;
    }
  }
  flush();
  if (!finalNewline) out = out.replace(/(\r?\n)+$/, '');
  else if (out && prev !== blocks.length - 1) out = out.replace(/(\r?\n)*$/, eol);
  return out;
}
