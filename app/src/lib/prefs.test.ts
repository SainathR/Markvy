import { describe, expect, it } from 'vitest';
import { applyPrefs, DEFAULT_PREFS, isDark, normalizePrefs, THEMES } from './prefs';

describe('prefs', () => {
  it('allows editing by default and keeps a stored choice', () => { expect(DEFAULT_PREFS.allowEditing).toBe(true); expect(normalizePrefs({ allowEditing: false }).allowEditing).toBe(false); });

  it('lists the eight prototype themes in order', () => {
    expect(THEMES.map((t) => t.id)).toEqual(['system', 'light', 'sepia', 'slate', 'rose', 'dark', 'dusk', 'ember']);
  });

  it('normalizes unknown input to defaults and clamps numbers', () => {
    expect(normalizePrefs(undefined)).toEqual(DEFAULT_PREFS);
    const p = normalizePrefs({ theme: 'dusk', fontSize: 2, width: 500, lineHeight: 'x', zoom: 120, font: 'comic', lang: 'fr', contrast: 1 });
    expect(p).toMatchObject({ theme: 'dusk', fontSize: 14, width: 100, lineHeight: 1.7, zoom: 120, font: 'serif', lang: 'en', contrast: false });
  });

  it('applies a palette theme on its light or dark base', () => {
    const root = document.createElement('html');
    applyPrefs({ ...DEFAULT_PREFS, theme: 'sepia', fontSize: 20, font: 'easy' }, root, false);
    expect(root.dataset.theme).toBe('light');
    expect(root.dataset.palette).toBe('sepia');
    expect(root.style.getPropertyValue('--read-size')).toBe('1.25rem');
    expect(root.style.getPropertyValue('--read-font')).toBe('var(--font-easy)');
    applyPrefs({ ...DEFAULT_PREFS, theme: 'dark' }, root, false);
    expect(root.dataset.theme).toBe('dark');
    expect(root.dataset.palette).toBeUndefined();
  });

  it('keeps the privacy choices, defaulting to ask', () => {
    expect([DEFAULT_PREFS.extLinks, DEFAULT_PREFS.remoteImages]).toEqual(['ask', 'ask']);
    expect(normalizePrefs({ extLinks: 'direct', remoteImages: 'block' })).toMatchObject({ extLinks: 'direct', remoteImages: 'block' });
    expect(normalizePrefs({ extLinks: 'always', remoteImages: 'yes' })).toMatchObject({ extLinks: 'ask', remoteImages: 'ask' });
  });

  it('follows the system for Automatic', () => {
    const root = document.createElement('html');
    applyPrefs({ ...DEFAULT_PREFS, theme: 'system', contrast: true, reduceMotion: true }, root, true);
    expect(root.dataset.theme).toBeUndefined();
    expect(root.dataset.contrast).toBe('high');
    expect(root.dataset.motion).toBe('reduce');
    expect(isDark({ ...DEFAULT_PREFS, theme: 'system' }, true)).toBe(true);
    expect(isDark({ ...DEFAULT_PREFS, theme: 'ember' }, false)).toBe(true);
    expect(isDark({ ...DEFAULT_PREFS, theme: 'rose' }, true)).toBe(false);
  });
});
