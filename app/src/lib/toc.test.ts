import { describe, expect, it } from 'vitest';
import { buildToc, currentSlug, readingPercent } from './toc';

const h = (slug: string, level: number, top: number) => ({ slug, text: slug, level, top });

describe('toc', () => {
  it('nests h3 under h2 and leaves out the title', () => {
    const toc = buildToc([h('title', 1, 0), h('a', 2, 100), h('a1', 3, 200), h('b', 2, 300)]);
    expect(toc.map((n) => n.slug)).toEqual(['a', 'b']);
    expect(toc[0].children.map((n) => n.slug)).toEqual(['a1']);
  });

  it('finds the section being read, and the last one at the bottom', () => {
    const hs = [h('title', 1, 0), h('a', 2, 500), h('b', 2, 1500)];
    expect(currentSlug(hs, 0, 800, 3000)).toBe('title');
    expect(currentSlug(hs, 1450, 800, 3000)).toBe('b');
    expect(currentSlug(hs, 2200, 800, 3000)).toBe('b');
    expect(currentSlug([], 0, 800, 3000)).toBeNull();
  });

  it('computes reading progress, treating short pages as read', () => {
    expect(readingPercent(0, 3000, 1000)).toBe(0);
    expect(readingPercent(1000, 3000, 1000)).toBe(50);
    expect(readingPercent(0, 900, 1000)).toBe(100);
  });
});
