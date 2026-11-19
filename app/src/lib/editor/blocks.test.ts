// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { joinRaw, splitBlocks } from './blocks';

const dir = new URL('../../../tests/fixtures/editing/', import.meta.url);
const lf = (s: string) => s.replace(/\r\n/g, '\n');
const lists = lf(readFileSync(new URL('lists.md', dir), 'utf8'));
const fixtures: Record<string, string> = {};
for (const f of readdirSync(dir)) {
  const text = readFileSync(new URL(f, dir), 'utf8');
  fixtures[f] = text; // as checked out (CRLF under .gitattributes)
  fixtures[`lf/${f}`] = lf(text);
}
Object.assign(fixtures, {
  'crlf.md': lists.replace(/\n/g, '\r\n'),
  'mixed-endings.md': lists.slice(0, 40).replace(/\n/g, '\r\n') + lists.slice(40),
  'no-final-newline.md': '# Title\n\nLast line',
  'empty.md': '',
  'only-blank.md': '\n\n\n',
});
const sample = new URL('../../../tests/fixtures/sample-wiki/', import.meta.url);
for (const f of ['README.md', 'Getting-Started.md', 'Guides/Introduction.md', 'Technical/Architecture.md']) fixtures[`sample/${f}`] = readFileSync(new URL(f, sample), 'utf8');

describe('splitBlocks', () => {
  for (const [name, text] of Object.entries(fixtures)) {
    it(`joins back to the exact bytes: ${name}`, () => expect(joinRaw(splitBlocks(text).blocks)).toBe(text));
  }

  it('keeps mixed line endings of untouched blocks', () => {
    const text = fixtures['mixed-endings.md'];
    const { blocks, eol } = splitBlocks(text);
    expect(eol).toBe(text.split('\r\n').length - 1 >= (text.match(/(?<!\r)\n/g) ?? []).length ? '\r\n' : '\n');
    expect(blocks[0].raw).toContain('\r\n');
    expect(blocks.at(-1)!.raw).not.toContain('\r');
  });

  it('names the kinds that become cards', () => {
    const kinds = splitBlocks(fixtures['mixed.md']).blocks.map((b) => b.kind);
    for (const k of ['frontmatter', 'heading', 'callout', 'mermaid', 'math', 'paragraph', 'html', 'code'] as const) expect(kinds).toContain(k);
  });

  it('attaches blank lines to the block before them', () => {
    const { blocks } = splitBlocks('a\n\n\nb\n');
    expect(blocks.map((b) => b.raw)).toEqual(['a\n\n\n', 'b\n']);
  });

  it('records the final newline', () => {
    expect(splitBlocks('x').finalNewline).toBe(false);
    expect(splitBlocks('x\n').finalNewline).toBe(true);
  });
});
