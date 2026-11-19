import { describe, expect, it } from 'vitest';
import { friendlyName, slugify, uniqueSlugger } from './slug';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

describe('slugs', () => {
  it('matches the prototype rules', () => {
    expect(slugify("Wi-Fi won't connect")).toBe('wi-fi-wont-connect');
    expect(slugify('Café & Co')).toBe('café-co');
  });

  it('numbers repeated headings', () => {
    const next = uniqueSlugger();
    expect([next('Notes'), next('Notes'), next('Notes')]).toEqual(['notes', 'notes-1', 'notes-2']);
  });

  it('never repeats a slug, even when a heading already looks numbered', () => {
    const next = uniqueSlugger();
    expect([next('Example'), next('Example'), next('Example 1')]).toEqual(['example', 'example-1', 'example-1-1']);
  });

  it('turns file paths into readable names', () => {
    expect(friendlyName('Guides/Getting-Started.md')).toBe('Getting Started');
  });
});

// The core numbers headings for search results; both sides must agree (tests/fixtures/slug-cases.json).
const cases = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../tests/fixtures/slug-cases.json'), 'utf8')) as {
  single: [string, string][];
  sequences: { in: string[]; out: string[] }[];
};

describe('shared slug cases', () => {
  it('follows the slug cases shared with the core', () => {
    for (const [input, out] of cases.single) expect(slugify(input)).toBe(out);
    for (const seq of cases.sequences) {
      const next = uniqueSlugger();
      expect(seq.in.map((s) => next(s))).toEqual(seq.out);
    }
  });
});
