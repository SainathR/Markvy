import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { editorViewCtx, remarkCtx } from '@milkdown/kit/core';
import { EditorState, TextSelection } from '@milkdown/kit/prose/state';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { splitBlocks } from './blocks';
import { createCodec, type Codec } from './codec';
import { load, toMarkdown } from './model';
import { detectStyle } from './style';

// Fixtures are checked out as CRLF (.gitattributes); each is tested as read and as an LF copy.
const dir = path.join(process.cwd(), 'tests/fixtures/editing');
const files: Record<string, string> = {};
for (const f of readdirSync(dir)) {
  const text = readFileSync(path.join(dir, f), 'utf8');
  files[f] = text;
  files[`lf-${f}`] = text.replace(/\r\n/g, '\n');
}
files['crlf.md'] = files['lf-lists.md'].replace(/\n/g, '\r\n');
files['no-final-newline.md'] = '# Title\n\nLast line';

let codec: Codec | undefined;
const codecFor = async (text: string) => { codec?.destroy(); codec = await createCodec(document.createElement('div'), detectStyle(splitBlocks(text).blocks)); return codec; };
afterAll(() => codec?.destroy());

/** Replaces the top-level node at `index` with a paragraph of `text` (a simulated edit). */
function editBlock(c: Codec, doc: ReturnType<typeof load>['doc'], index: number, text: string) {
  const para = c.parse(text)[0];
  const nodes: typeof para[] = [];
  doc.forEach((n, _o, i) => nodes.push(i === index ? para : n));
  return c.doc(nodes);
}

const changedLines = (a: string, b: string) => {
  const x = a.split('\n'), y = b.split('\n');
  return x.map((l, i) => (l === y[i] ? null : i)).filter((i) => i !== null);
};

describe('block-patched saves', () => {
  for (const [name, text] of Object.entries(files)) {
    it(`saving without changes is byte-identical: ${name}`, async () => {
      const c = await codecFor(text);
      const loaded = load(text, c);
      expect(toMarkdown(loaded.doc, loaded, c)).toBe(text);
    });
  }

  it('an edit to one block changes only that block’s lines', async () => {
    const text = files['lf-mixed.md'];
    const c = await codecFor(text);
    const loaded = load(text, c);
    const i = loaded.split.blocks.findIndex((b) => b.norm.startsWith('Text with a footnote'));
    const target = loaded.origin.slice(0, i).reduce((n, g) => n + g.length, 0);
    const out = toMarkdown(editBlock(c, loaded.doc, target, 'Changed text.'), loaded, c);
    expect(out).toBe(text.replace(loaded.split.blocks[i].raw, 'Changed text.\n\n'));
    expect(changedLines(text, out)).toHaveLength(1);
    expect(out).toContain('[[Wiki Page|label]]'); // untouched wiki links are never escaped
  });

  it('inserting between touching blocks keeps them apart', async () => {
    const text = 'text right before a list\n- touching list\n';
    const c = await codecFor(text);
    const loaded = load(text, c);
    const nodes: ReturnType<Codec['parse']> = [];
    loaded.doc.forEach((n, _o, i) => { nodes.push(n); if (i === 0) nodes.push(c.parse('Inserted.')[0]); });
    const out = toMarkdown(c.doc(nodes), loaded, c);
    expect(out).toMatch(/^text right before a list\n\nInserted\.\n\n- touching list\n$/);
  });

  /** Rebuilds the doc from its top-level nodes, picked and ordered by `pick`. */
  const rebuild = (c: Codec, doc: ReturnType<typeof load>['doc'], pick: (nodes: ReturnType<Codec['parse']>) => ReturnType<Codec['parse']>) => {
    const nodes: ReturnType<Codec['parse']> = [];
    doc.forEach((n) => nodes.push(n));
    return c.doc(pick(nodes));
  };

  it('deleting a block between touching blocks keeps the others apart', async () => {
    const text = 'Steps:\n- a\n\nNext\n';
    const c = await codecFor(text);
    const loaded = load(text, c);
    expect(toMarkdown(rebuild(c, loaded.doc, ([a, , b]) => [a, b]), loaded, c)).toBe('Steps:\n\nNext\n');
  });

  it('appending to a file with no final newline keeps the new paragraph separate', async () => {
    const text = files['no-final-newline.md'];
    const c = await codecFor(text);
    const loaded = load(text, c);
    expect(toMarkdown(rebuild(c, loaded.doc, (n) => [...n, c.parse('New')[0]]), loaded, c)).toBe('# Title\n\nLast line\n\nNew');
  });

  it('a moved block stays apart from its new neighbours', async () => {
    const text = 'First\n\nSecond\n- item\n';
    const c = await codecFor(text);
    const loaded = load(text, c);
    expect(toMarkdown(rebuild(c, loaded.doc, ([a, b, l]) => [a, l, b]), loaded, c)).toBe('First\n\n- item\n\nSecond\n');
    expect(toMarkdown(rebuild(c, loaded.doc, ([a, b, l]) => [l, a, b]), loaded, c)).toBe('- item\n\nFirst\n\nSecond\n');
  });

  it('a paragraph with reference links or footnote references is a card', async () => {
    const text = 'See [docs][ref] and note[^1].\n\n[ref]: https://x\n\n[^1]: Note.\n';
    const c = await codecFor(text);
    const loaded = load(text, c);
    expect(loaded.doc.child(0).type.name).toBe('markvy_card');
    expect(toMarkdown(loaded.doc, loaded, c)).toBe(text);
  });

  it('escaped brackets and dollars stay literal text and keep their backslashes when edited', async () => {
    const text = 'Literal \\[\\[Not wiki]] and \\$x\\$.\n';
    const c = await codecFor(text);
    const loaded = load(text, c);
    const atoms: string[] = [];
    loaded.doc.descendants((n) => { if (n.type.name.startsWith('markvy_')) atoms.push(n.type.name); });
    expect(atoms).toEqual([]);
    const out = toMarkdown(editBlock(c, loaded.doc, 0, 'Literal \\[\\[Not wiki]] and \\$x\\$. More'), loaded, c);
    expect(out).toBe('Literal \\[\\[Not wiki]] and \\$x\\$. More\n');
  });

  it('edited blocks use the file’s line ending', async () => {
    const text = files['crlf.md'];
    const c = await codecFor(text);
    const loaded = load(text, c);
    const out = toMarkdown(editBlock(c, loaded.doc, 0, '# Renamed'), loaded, c);
    expect(out.startsWith('# Renamed\r\n')).toBe(true);
    expect(out.replace(/\r\n/g, '').includes('\n')).toBe(false);
  });

  it('cards keep their source exactly and wiki links survive an edit of their paragraph', async () => {
    const text = 'Go to [[Other Page]] now.\n\n```mermaid\nflowchart LR\n  A-->B\n```\n';
    const c = await codecFor(text);
    const loaded = load(text, c);
    expect(loaded.doc.child(1).type.name).toBe('markvy_card');
    const para = c.parse('Go to [[Other Page]] today.')[0];
    const out = toMarkdown(c.doc([para, loaded.doc.child(1)]), loaded, c);
    expect(out).toBe('Go to [[Other Page]] today.\n\n```mermaid\nflowchart LR\n  A-->B\n```\n');
  });
});

describe('typing wiki links and maths', () => {
  /** Types `text` at the end of the document one key at a time, the way the editor view receives it. */
  async function typed(start: string, text: string) {
    const c = await codecFor(start);
    const loaded = load(start, c);
    const view = c.editor.ctx.get(editorViewCtx);
    view.updateState(EditorState.create({ doc: loaded.doc, plugins: view.state.plugins }));
    view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)));
    for (const ch of text) {
      const { from, to } = view.state.selection;
      const insert = () => view.state.tr.insertText(ch, from, to);
      if (!view.someProp('handleTextInput', (f) => f(view, from, to, ch, insert))) view.dispatch(insert());
    }
    const atoms: string[] = [];
    view.state.doc.descendants((n) => { if (n.type.name.startsWith('markvy_')) atoms.push(`${n.type.name}:${n.attrs.raw}`); });
    return { atoms, md: toMarkdown(view.state.doc, loaded, c) };
  }

  it('a typed [[Page]] becomes a wiki link and is saved unescaped', async () => {
    const r = await typed('Intro\n', ' see [[Other Page]] now');
    expect(r.atoms).toEqual(['markvy_wiki:[[Other Page]]']);
    expect(r.md).toBe('Intro see [[Other Page]] now\n');
  });

  it('typed $maths$ becomes maths and is saved unescaped', async () => {
    const r = await typed('Intro\n', ' $x^2$ done');
    expect(r.atoms).toEqual(['markvy_math:$x^2$']);
    expect(r.md).toBe('Intro $x^2$ done\n');
  });

  it('prices stay plain text', async () => {
    const r = await typed('Intro\n', ' costs $5 and $6');
    expect(r.atoms).toEqual([]);
    expect(r.md).toBe('Intro costs $5 and $6\n');
  });
});

describe('a view wired like the editor pane', () => {
  /** Mounts `text` the way EditorPane does and records every text the pane would hand to the session. */
  async function mount(text: string) {
    const c = await codecFor(text);
    const loaded = load(text, c);
    const view = c.editor.ctx.get(editorViewCtx);
    const emitted: string[] = [];
    view.setProps({
      dispatchTransaction(tr) {
        view.updateState(view.state.apply(tr));
        if (tr.docChanged) emitted.push(toMarkdown(view.state.doc, loaded, c));
      },
    });
    view.updateState(EditorState.create({ doc: loaded.doc, plugins: view.state.plugins }));
    await new Promise((r) => setTimeout(r, 0)); // plugin views may dispatch after a tick
    return { view, loaded, emitted };
  }

  const page = '# Title #\n\nSetext title\n============\n\n#   Spaced   title\n\nBody text.\n\n1. one\n1. one again\n\n3. three\n4. four\n\n| a | b |\n|:--|--:|\n| 1 | 2 |\n';

  it('opening a page changes nothing', async () => {
    const { view, loaded, emitted } = await mount(page);
    expect(emitted).toEqual([]);
    expect(view.state.doc.child(0)).toBe(loaded.doc.child(0));
    expect(toMarkdown(view.state.doc, loaded, codec!)).toBe(page);
  });

  it('typing in one paragraph changes only that line', async () => {
    const { view, emitted } = await mount(page);
    let at = 0;
    view.state.doc.descendants((n, pos) => { if (n.isText && n.text === 'Body text.') at = pos + n.nodeSize; });
    view.dispatch(view.state.tr.insertText('!', at));
    expect(emitted.at(-1)).toBe(page.replace('Body text.', 'Body text.!'));
  });
});

describe('parsing many blocks at once', () => {
  it('gives every block exactly what parsing it alone gives', async () => {
    const tricky = [
      'See [docs][ref] and note[^1].\n', '[ref]: https://x\n', '[^1]: Note.\n', 'Uses [ref] again.\n',
      'text right before a list\n', '- touching list\n', '    indented after a list\n', '```js\nunclosed fence\n',
      'Para\n', '===\n', '> quote\n', 'lazy line\n', '<div>\n', 'html\n\n', '1. one\n1. one again\n\n', '| a | b |\n|:--|--:|\n| 1 | 2 |\n',
      'Go to [[Other Page]] and $x^2$ and \\[\\[not]] \\$5\\$.\n', '- [ ] task\n- [x] done\n', '', '\n\n',
      // After indented code micromark reads the next line as an interruption: a list must start at 1 and may not be empty.
      '    indented code\n', '2. two\n', '-\n', '- item\n\n      code in item\n', '3) three\n', '﻿starts with a BOM\n',
      '    code a\n', '    code b\n', '10. ten\n', '    code c\n', '', '2. after an empty block\n', '    code d\n', '[ref2]: /x\n',
      '    code e\n', 'Setext after code\n===\n', '    code f\n', 'a | b\n--|--\n1 | 2\n', '    code g\n', 'Ünïcode words, then\n- a list\n',
      '    code h\n', '# Heading after code\n', '    code i\n', '﻿2. BOM then a list\n',
    ];
    const texts = [...Object.values(files).flatMap((t) => splitBlocks(t).blocks.map((b) => b.norm)), ...tricky, ...tricky.slice().reverse()];
    const c = await codecFor(texts.join(''));
    // Every run of three neighbours: a definition anywhere in a run changes how the others read, so short runs test both ways.
    for (let i = 0; i + 3 <= texts.length; i++) {
      const run = texts.slice(i, i + 3);
      const many = c.parseMany(run);
      expect(many).toHaveLength(3);
      run.forEach((t, j) => {
        const alone = c.parse(t);
        expect(many[j].length, JSON.stringify(run)).toBe(alone.length);
        many[j].forEach((n, k) => expect(n.eq(alone[k]), JSON.stringify(run)).toBe(true));
      });
    }
  });

  it('a numbered list after indented code loads as a list', async () => {
    const text = 'Intro\n\n    $ npm install\n\n2. Second step\n3. Third step\n';
    const loaded = load(text, await codecFor(text));
    expect(loaded.doc.child(2).type.name).toBe('ordered_list');
  });
});

describe('speed', () => {
  // 100 KB of distinct blocks: small enough for every run. The 1 MB targets are measured in the app (editing-speed.e2e.ts).
  let page = '';
  for (let i = 0; page.length < 100_000; i++) page += `## Section ${i}\n\nSome *text* with a [link](a.md) and \`code\` number ${i}.\n\n- item ${i}\n- item\n\n`;

  it('parses a long page many blocks at a time, and loads and saves it without runaway time', async () => {
    const c = await codecFor(page);
    const parses = vi.spyOn(c.editor.ctx.get(remarkCtx), 'parse');
    let t = performance.now();
    const loaded = load(page, c);
    const loadMs = performance.now() - t;
    t = performance.now();
    expect(toMarkdown(loaded.doc, loaded, c)).toBe(page);
    const saveMs = performance.now() - t;
    const calls = parses.mock.calls.length;
    parses.mockRestore();
    const blocks = loaded.split.blocks.length;
    console.log(`SPEED load=${Math.round(loadMs)}ms save=${Math.round(saveMs)}ms bytes=${page.length} blocks=${blocks} parses=${calls}`);
    // One parse per block, twice (the old way), took 36-48 s for 1 MB here. The joined parses are the fast path.
    expect(calls).toBeLessThan(blocks / 20);
    // jsdom is several times slower than the app; only a runaway guard.
    expect(loadMs).toBeLessThan(30_000);
    expect(saveMs).toBeLessThan(2_000);
  }, 60_000);

  it('a page with indented code in every section is still parsed many blocks at a time', async () => {
    let code = '';
    for (let i = 0; code.length < 100_000; i++) code += `## Section ${i}\n\nRun this ${i}:\n\n    npm run thing-${i}\n\n`;
    const c = await codecFor(code);
    const parses = vi.spyOn(c.editor.ctx.get(remarkCtx), 'parse');
    const loaded = load(code, c);
    const calls = parses.mock.calls.length;
    parses.mockRestore();
    console.log(`SPEED code-heavy parses=${calls} blocks=${loaded.split.blocks.length}`);
    expect(loaded.doc.childCount).toBe(loaded.split.blocks.length);
    expect(calls).toBeLessThan(loaded.split.blocks.length / 10);
  }, 60_000);
});
