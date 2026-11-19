import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { splitPrototype } from './port-styles.mjs';

const html = readFileSync(resolve('..', 'index.html'), 'utf8'); // vitest runs from app/

describe('port-styles', () => {
  const out = splitPrototype(html);
  it('takes every theme and the font tokens', () => {
    expect(out.tokens).toContain(':root[data-palette="ember"]');
    expect(out.tokens).toContain(':root[data-theme="dark"][data-contrast="high"]');
    expect(out.tokens).toContain('--font-easy');
  });
  it('keeps every screen, including Privacy & Help, but not the prototype strip', () => {
    for (const sel of ['.tab-main', '.swatch', '.home-hero', '.prefs-grid', '.toc-link', '.divider', '.lib-tabs', '.search-opts', '.result', '.findbar', '.suggest', '.promise', '.help-grid', '.radio-list', '.shortcuts', '.faq details']) {
      expect(out.app).toContain(sel);
    }
    expect(out.app).not.toContain('.proto-strip');
    expect(out.app).toContain('Desktop app overrides');
  });
  it('gives the find bar its own row in the pane', () => {
    expect(out.app).toContain('.pane > .findbar { grid-row: 4; }');
    expect(out.app).toContain('.pane > .scroller { grid-row: 5; }');
    expect(out.app).not.toContain('the find bar row returns in Plan 3');
  });
  it('separates document styles and the icon sprite', () => {
    expect(out.doc).toContain('.callout-note');
    expect(out.doc).not.toContain('.tab-main');
    expect(out.sprite).toContain('id="i-logo"');
    expect(out.sprite).toContain('id="i-trash"');
  });
});
