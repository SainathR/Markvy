export type ThemeId = 'system' | 'light' | 'sepia' | 'slate' | 'rose' | 'dark' | 'dusk' | 'ember';
export type FontId = 'serif' | 'sans' | 'easy';
export type Lang = 'en' | 'es' | 'de';

export interface Prefs {
  theme: ThemeId;
  contrast: boolean;
  fontSize: number;
  width: number;
  lineHeight: number;
  zoom: number;
  font: FontId;
  reduceMotion: boolean;
  lang: Lang;
  extLinks: 'ask' | 'direct';
  remoteImages: 'ask' | 'block';
  allowEditing: boolean;
}

export interface Theme {
  id: ThemeId;
  name: string;
  base: 'light' | 'dark' | null;
  preview: { page: string; text: string; accent: string };
}

/** Exactly the prototype's themes (index.html, const THEMES). */
export const THEMES: readonly Theme[] = [
  { id: 'system', name: 'Automatic', base: null, preview: { page: 'linear-gradient(135deg, #FFFFFF 50%, #181C19 50%)', text: '#7F8A83', accent: '#2E6A54' } },
  { id: 'light', name: 'Paper', base: 'light', preview: { page: '#FFFFFF', text: '#1C211E', accent: '#2E6A54' } },
  { id: 'sepia', name: 'Sepia', base: 'light', preview: { page: '#FBF5E9', text: '#3B2F22', accent: '#8A4B22' } },
  { id: 'slate', name: 'Slate', base: 'light', preview: { page: '#FFFFFF', text: '#1A2230', accent: '#2457A6' } },
  { id: 'rose', name: 'Rose', base: 'light', preview: { page: '#FFFFFF', text: '#2A1F22', accent: '#9C3554' } },
  { id: 'dark', name: 'Night', base: 'dark', preview: { page: '#181C19', text: '#E3E7E2', accent: '#7BC3A5' } },
  { id: 'dusk', name: 'Dusk', base: 'dark', preview: { page: '#161D2D', text: '#E2E7F0', accent: '#8FB4FF' } },
  { id: 'ember', name: 'Ember', base: 'dark', preview: { page: '#1C1815', text: '#ECE4DA', accent: '#E8A75A' } },
];

export const DEFAULT_PREFS: Prefs = {
  theme: 'light', contrast: false, fontSize: 18, width: 68, lineHeight: 1.7, zoom: 100, font: 'serif', reduceMotion: false, lang: 'en',
  extLinks: 'ask', remoteImages: 'ask', allowEditing: true,
};

export const LIMITS = {
  fontSize: [14, 28],
  width: [45, 100],
  lineHeight: [1.3, 2.2],
  zoom: [80, 150],
} as const satisfies Record<string, readonly [number, number]>;

const FONTS: readonly FontId[] = ['serif', 'sans', 'easy'];
const LANGS: readonly Lang[] = ['en', 'es', 'de'];

const clamp = (v: unknown, [lo, hi]: readonly [number, number], fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;

export function normalizePrefs(raw: unknown): Prefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_PREFS;
  return {
    theme: THEMES.some((t) => t.id === r.theme) ? (r.theme as ThemeId) : d.theme,
    contrast: typeof r.contrast === 'boolean' ? r.contrast : d.contrast,
    fontSize: clamp(r.fontSize, LIMITS.fontSize, d.fontSize),
    width: clamp(r.width, LIMITS.width, d.width),
    lineHeight: clamp(r.lineHeight, LIMITS.lineHeight, d.lineHeight),
    zoom: clamp(r.zoom, LIMITS.zoom, d.zoom),
    font: FONTS.includes(r.font as FontId) ? (r.font as FontId) : d.font,
    reduceMotion: typeof r.reduceMotion === 'boolean' ? r.reduceMotion : d.reduceMotion,
    lang: LANGS.includes(r.lang as Lang) ? (r.lang as Lang) : d.lang,
    extLinks: r.extLinks === 'direct' ? 'direct' : 'ask',
    remoteImages: r.remoteImages === 'block' ? 'block' : 'ask',
    allowEditing: typeof r.allowEditing === 'boolean' ? r.allowEditing : d.allowEditing,
  };
}

export const themeOf = (id: ThemeId): Theme => THEMES.find((t) => t.id === id) ?? THEMES[1];

export function isDark(prefs: Prefs, systemDark: boolean): boolean {
  const base = themeOf(prefs.theme).base;
  return base ? base === 'dark' : systemDark;
}

/** Writes what the prototype CSS reads (tokens.css: data-theme, data-palette, data-contrast, data-motion, --read-*). */
export function applyPrefs(prefs: Prefs, root: HTMLElement, systemDark: boolean): void {
  void systemDark; // "Automatic" is resolved by the CSS media query; kept for symmetry with isDark
  const base = themeOf(prefs.theme).base;
  if (base) root.dataset.theme = base;
  else delete root.dataset.theme;
  if (base && prefs.theme !== base) root.dataset.palette = prefs.theme;
  else delete root.dataset.palette;
  root.dataset.contrast = prefs.contrast ? 'high' : 'normal';
  root.dataset.motion = prefs.reduceMotion ? 'reduce' : 'system';
  root.style.fontSize = `${prefs.zoom}%`;
  root.style.setProperty('--read-size', `${prefs.fontSize / 16}rem`);
  root.style.setProperty('--read-width', `${prefs.width}ch`);
  root.style.setProperty('--read-lh', String(prefs.lineHeight));
  root.style.setProperty('--read-font', `var(--font-${prefs.font})`);
  root.lang = prefs.lang;
}
