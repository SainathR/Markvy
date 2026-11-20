import { defaultValueCtx, Editor, editorViewCtx, editorViewOptionsCtx, parserCtx, remarkCtx, remarkStringifyOptionsCtx, rootCtx, schemaCtx, serializerCtx } from '@milkdown/kit/core';
import { clipboard } from '@milkdown/kit/plugin/clipboard';
import { history } from '@milkdown/kit/plugin/history';
import { commonmark, syncHeadingIdPlugin, toggleLinkCommand } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { InputRule } from '@milkdown/kit/prose/inputrules';
import type { Node as PMNode } from '@milkdown/kit/prose/model';
import { ParserState } from '@milkdown/kit/transformer';
import { $inputRule, $node, $remark, callCommand } from '@milkdown/kit/utils';
import type { BlockKind } from './blocks';
import { stringifyOptions, type MdStyle } from './style';

export interface Codec {
  parse(md: string): PMNode[];
  /** The same as `texts.map(parse)`, parsed many at a time: each parse has a large fixed cost. */
  parseMany(texts: string[]): PMNode[][];
  serialize(nodes: PMNode[]): string;
  card(raw: string, kind: BlockKind): PMNode;
  doc(nodes: PMNode[]): PMNode;
  editor: Editor;
  destroy(): void;
}

/** Links the selected text to `href`. With nothing selected, the address itself becomes the link text. */
export function addWebLink(c: Codec, href: string) {
  const view = c.editor.ctx.get(editorViewCtx);
  const { from, empty } = view.state.selection;
  if (empty) view.dispatch(view.state.tr.insertText(href).addMark(from, from + href.length, view.state.schema.marks.link.create({ href })));
  else c.editor.action(callCommand(toggleLinkCommand.key, { href }));
}

type MdNode = { type: string; value?: string; children?: MdNode[]; position?: { start: { offset?: number }; end: { offset?: number } } };
const INLINE = /\[\[[^\]|\n]+(?:\|[^\]\n]+)?\]\]|\$(?!\s)[^$\n]+?(?<!\s)\$(?!\d)/g;

/** True when the source holds exactly the node's decoded text, so no escape or entity hides a `[[` or `$`. */
const literal = (node: MdNode, source: string) => {
  const p = node.position;
  return p?.start.offset !== undefined && p.end.offset !== undefined && source.slice(p.start.offset, p.end.offset) === node.value;
};

/** Splits `[[wiki]]` and `$maths$` out of text nodes so the serializer writes them back verbatim instead of escaping them. */
const inlineRaw = $remark('markvyInlineRaw', () => () => (tree: MdNode, file: { value: unknown }) => {
  const source = String(file.value);
  const walk = (node: MdNode) => {
    if (!node.children) return;
    node.children = node.children.flatMap((child) => {
      if (child.type !== 'text' || !child.value || !literal(child, source)) { walk(child); return [child]; }
      const out: MdNode[] = [];
      let last = 0;
      for (const m of child.value.matchAll(INLINE)) {
        if (m.index! > last) out.push({ type: 'text', value: child.value.slice(last, m.index) });
        out.push({ type: m[0].startsWith('[[') ? 'markvyWiki' : 'markvyMath', value: m[0] });
        last = m.index! + m[0].length;
      }
      if (last < child.value.length) out.push({ type: 'text', value: child.value.slice(last) });
      return out.length ? out : [child];
    });
  };
  walk(tree);
});

const inlineAtom = (name: 'markvy_wiki' | 'markvy_math', mdType: string, cls: string) =>
  $node(name, () => ({
    group: 'inline', inline: true, atom: true, selectable: true,
    attrs: { raw: { default: '' } },
    parseDOM: [{ tag: `span[data-${cls}]`, getAttrs: (d) => ({ raw: (d as HTMLElement).dataset[cls] ?? '' }) }],
    toDOM: (n) => ['span', { [`data-${cls}`]: n.attrs.raw, class: `ed-${cls}`, contenteditable: 'false' }, n.attrs.raw],
    parseMarkdown: { match: (n) => n.type === mdType, runner: (state, n, type) => { state.addNode(type, { raw: (n as MdNode).value }); } },
    toMarkdown: { match: (n) => n.type.name === name, runner: (state, n) => { state.addNode('html', undefined, n.attrs.raw); } },
  }));

const wikiNode = inlineAtom('markvy_wiki', 'markvyWiki', 'wiki');
const mathNode = inlineAtom('markvy_math', 'markvyMath', 'math');

/** Typing the closing `]]` or `$` turns the text into the atom, so it is saved as typed instead of escaped. Same shapes as INLINE. */
const typedAtom = (node: typeof wikiNode, re: RegExp) =>
  $inputRule((ctx) => new InputRule(re, (state, m, start, end) => {
    const code = state.schema.marks.inlineCode;
    if (state.doc.textBetween(start, end).length !== end - start) return null; // an atom or line break inside
    if (code && (state.doc.rangeHasMark(start, end, code) || code.isInSet(state.storedMarks ?? state.doc.resolve(start).marks()))) return null;
    return state.tr.replaceWith(start, end, node.type(ctx).create({ raw: m[0] }));
  }));
const wikiRule = typedAtom(wikiNode, /\[\[[^\]|\n]+(?:\|[^\]\n]+)?\]\]$/);
// ponytail: "not followed by a digit" can't be known when the `$` is typed; `$x$5` then reads back as text, as the reader shows it.
const mathRule = typedAtom(mathNode, /\$(?!\s)[^$\n]+?(?<!\s)\$$/);

/** A block the editor shows rendered and writes back exactly as it was (or as Edit source changed it). */
const cardNode = $node('markvy_card', () => ({
  group: 'block', atom: true, selectable: true, draggable: false,
  attrs: { raw: { default: '' }, kind: { default: 'opaque' } },
  parseDOM: [{ tag: 'div[data-card]', getAttrs: (d) => ({ raw: (d as HTMLElement).dataset.card ?? '', kind: (d as HTMLElement).dataset.kind ?? 'opaque' }) }],
  toDOM: (n) => ['div', { 'data-card': n.attrs.raw, 'data-kind': n.attrs.kind, class: 'ed-card' }],
  parseMarkdown: { match: () => false, runner: () => {} },
  toMarkdown: { match: (n) => n.type.name === 'markvy_card', runner: (state, n) => { state.addNode('html', undefined, String(n.attrs.raw).replace(/\n+$/, '')); } },
}));

export async function createCodec(host: HTMLElement, style: MdStyle): Promise<Codec> {
  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, host);
      ctx.set(defaultValueCtx, '');
      ctx.update(remarkStringifyOptionsCtx, (o) => {
        const text = o.handlers!.text!;
        return {
          ...o, ...stringifyOptions(style),
          // Plain text that would read back as `[[wiki]]` or `$maths$` keeps its brackets and dollars escaped.
          handlers: { ...o.handlers, text: (node, ...rest) => {
            const md = text(node, ...rest);
            return node.value.search(INLINE) < 0 ? md : md.replace(/(\\*)([[$])/g, (m, bs: string, c: string) => (bs.length % 2 ? m : `${bs}\\${c}`));
          } },
        };
      });
      ctx.update(editorViewOptionsCtx, (o) => ({ ...o, attributes: { class: 'ed-surface', spellcheck: 'true', 'aria-label': 'Document text', role: 'textbox', 'aria-multiline': 'true' } }));
    })
    // Heading ids would rewrite every heading on open (`# Title #` → `# Title`) before anyone types.
    .use(commonmark.filter((p) => p !== syncHeadingIdPlugin)).use(gfm).use(history).use(clipboard)
    .use(inlineRaw).use(wikiNode).use(mathNode).use(cardNode).use(wikiRule).use(mathRule)
    .create();
  const parser = editor.ctx.get(parserCtx);
  const serializer = editor.ctx.get(serializerCtx);
  const schema = editor.ctx.get(schemaCtx);
  const doc = (nodes: PMNode[]) => schema.topNodeType.create(null, nodes);
  const parse = (md: string) => { const out: PMNode[] = []; parser(md).forEach((n) => out.push(n)); return out; };
  const remark = editor.ctx.get(remarkCtx);
  const state = new ParserState(schema);
  const build = (children: MdNode[]) => { const out: PMNode[] = []; state.next({ type: 'root', children } as never).toDoc().forEach((n) => out.push(n)); return out; };

  /**
   * Parses `texts[from..to)` as one Markdown source, each text after a blank line, then hands every text the top-level
   * nodes that lie inside it. Undefined when that could differ from parsing each text alone: a definition (it changes
   * how references in other texts read) or a node that crosses from one text into the next.
   */
  const parseJoined = (texts: string[], from: number, to: number): PMNode[][] | undefined => {
    const starts: number[] = [];
    let source = '';
    for (let i = from; i < to; i++) { if (i > from) source += '\n\n'; starts.push(source.length); source += texts[i]; }
    const tree = remark.parse(source) as MdNode;
    const defines = (n: MdNode): boolean => n.type === 'definition' || n.type === 'footnoteDefinition' || !!n.children?.some(defines);
    if (defines(tree)) return undefined;
    const tops = (remark.runSync(tree as never, source) as MdNode).children ?? [];
    const groups: MdNode[][] = starts.map(() => []);
    let k = 0;
    for (const n of tops) {
      const s = n.position?.start.offset, e = n.position?.end.offset;
      if (s === undefined || e === undefined) return undefined;
      while (k + 1 < starts.length && starts[k + 1] <= s) k++;
      if (s < starts[k] || e > starts[k] + texts[from + k].length) return undefined;
      groups[k].push(n);
    }
    // micromark reads the first line after indented code as an interruption (a list must start at 1, an empty item or a
    // definition cannot start ...), which a text parsed alone never is; and it drops a BOM only at the start of a source.
    // Such a text is parsed again alone, unless its first line starts with `#` or a letter and has no `|`: then only a
    // heading or a paragraph can start there, and neither depends on the interruption.
    const indented = (n: MdNode | undefined): boolean => {
      while (n?.children?.length) n = n.children.at(-1);
      return n?.type === 'code' && !/^ {0,3}(`{3,}|~{3,})/.test(source.slice(n.position!.start.offset));
    };
    let prev: MdNode | undefined; // the last node before the current text, in the joined tree
    return groups.map((g, k) => {
      const text = texts[from + k], before = prev;
      prev = g.at(-1) ?? prev;
      const alone = k > 0 && (text.startsWith('﻿') || (indented(before) && !/^ {0,3}[#\p{L}][^|\n]*(\n|$)/u.test(text)));
      return alone ? parse(text) : build(g);
    });
  };
  const JOIN_CHARS = 8000; // parse time grows faster than length on long sources; about this size is fastest

  return {
    editor,
    parse,
    parseMany: (texts) => {
      const out: PMNode[][] = [];
      for (let i = 0; i < texts.length; ) {
        let j = i + 1;
        for (let size = texts[i].length; j < texts.length && size + texts[j].length < JOIN_CHARS; j++) size += texts[j].length;
        out.push(...(parseJoined(texts, i, j) ?? texts.slice(i, j).map(parse)));
        i = j;
      }
      return out;
    },
    serialize: (nodes) => serializer(doc(nodes)),
    card: (raw, kind) => schema.nodes.markvy_card.create({ raw, kind }),
    doc,
    destroy: () => void editor.destroy(),
  };
}
