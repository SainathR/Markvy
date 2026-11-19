import { describe, expect, it } from 'vitest';
import type { SearchResult } from './core';
import { highlight, matcher, suggestionsFrom } from './search';

describe('matcher', () => {
  it('escapes regular-expression characters', () => {
    expect('Price: C++ (beta) $5'.match(matcher('c++ (beta)', false)!)).toEqual(['C++ (beta)']);
    expect('Costs $5.'.match(matcher('$5', false)!)).toEqual(['$5']);
  });

  it('respects whole words, accented letters included', () => {
    expect('café caf'.match(matcher('caf', true)!)).toEqual(['caf']);
  });

  it('returns null for a blank query', () => {
    expect(matcher('   ', false)).toBeNull();
  });
});

describe('highlight', () => {
  it('splits text into plain and matching parts, any word, any case', () => {
    expect(highlight('Wi-Fi and the guest network', 'GUEST wi-fi', false)).toEqual([
      { text: 'Wi-Fi', hit: true }, { text: ' and the ', hit: false }, { text: 'guest', hit: true }, { text: ' network', hit: false },
    ]);
  });

  it('matches accented and non-Latin text', () => {
    expect(highlight('Le CAFÉ ouvre. Привет мир', 'café привет', false).filter((s) => s.hit).map((s) => s.text)).toEqual(['CAFÉ', 'Привет']);
  });

  it('leaves text alone for a blank query', () => {
    expect(highlight('abc', ' ', false)).toEqual([{ text: 'abc', hit: false }]);
  });
});

describe('suggestionsFrom', () => {
  const result = (path: string, title: string, titleMatch: boolean, hits: SearchResult['hits'] = []): SearchResult =>
    ({ collectionId: 'sample', path, title, titleMatch, total: hits.length, hits });

  it('lists matching titles, then matching sections, up to the limit', () => {
    const hit = (slug: string, level: number, headingMatch: boolean) => ({ slug, heading: slug, level, snippet: '', headingMatch });
    const results = [
      result('a.md', 'Wi-Fi', true, [hit('wi-fi', 1, true)]),
      result('b.md', 'Network', false, [hit('wi-fi-setup', 2, true), hit('intro', 2, false)]),
    ];
    const out = suggestionsFrom(results, () => 'Sample library');
    expect(out).toEqual([
      { key: 'sample/a.md', slug: null, label: 'Wi-Fi', sub: 'Sample library › a.md', icon: 'file' },
      { key: 'sample/b.md', slug: 'wi-fi-setup', label: 'wi-fi-setup', sub: 'Section in Network', icon: 'hash' },
    ]);
    expect(suggestionsFrom(results, () => '', 1)).toHaveLength(1);
  });
});
