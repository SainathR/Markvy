import { describe, expect, it } from 'vitest';
import { sanitize } from './sanitize';

describe('sanitize', () => {
  it.each([
    ['<p>a</p><script>alert(1)</script>', '<script'],
    ['<img src="x" onerror="alert(1)">', 'onerror'],
    ['<a href="javascript:alert(1)">x</a>', 'javascript:'],
    ['<iframe src="https://evil.example"></iframe>', '<iframe'],
    ['<form action="https://evil.example"><input></form>', '<form'],
    ['<svg><script>alert(1)</script></svg>', '<script'],
    ['<p style="position:fixed;inset:0">cover</p>', 'style='],
    ['<object data="x.swf"></object>', '<object'],
    ['<p id="app">x</p>', 'id='],
  ])('removes %s', (input, forbidden) => {
    expect(sanitize(input)).not.toContain(forbidden);
  });

  it('keeps safe formatting and data attributes', () => {
    const out = sanitize('<p><strong>b</strong> <kbd>L</kbd> <a href="#" data-wiki="X">x</a></p>');
    expect(out).toContain('<strong>b</strong>');
    expect(out).toContain('<kbd>L</kbd>');
    expect(out).toContain('data-wiki="X"');
  });
});
