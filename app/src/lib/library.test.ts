import { describe, expect, it } from 'vitest';
import {
  addRecent, addSearch, allowSite, arrangeRows, bookmarkId, clearHistory, clearList, docKey, forbidSite, libraryRows, type LibraryRow, MAX_RECENT, MAX_SEARCHES, parseKey, parseLibrary,
  recordProgress, removeFromList, resetLibrary, toggleBookmark, toggleFavorite, toggleFavoriteCollection, toRaw,
} from './library';
import { DEFAULT_PREFS } from './prefs';

describe('library', () => {
  it('starts from defaults for an empty or Plan 1 library', () => {
    const lib = parseLibrary({ version: 1, collections: [] });
    expect(lib.prefs).toEqual(DEFAULT_PREFS);
    expect(lib.favorites).toEqual([]);
    expect(lib.recent).toEqual([]);
    expect(lib.session).toBeNull();
  });

  it('tolerates missing and malformed fields', () => {
    const lib = parseLibrary({
      favorites: ['sample/README.md', 7, null],
      recent: [{ key: 'sample/a.md', at: 5 }, { key: 3 }, 'x'],
      progress: { 'sample/a.md': 40, 'sample/b.md': 'lots', 'sample/c.md': 250 },
      session: { panes: 'nope' },
      prefs: { theme: 'neon', fontSize: 99 },
    });
    expect(lib.favorites).toEqual(['sample/README.md']);
    expect(lib.recent).toEqual([{ key: 'sample/a.md', at: 5 }]);
    expect(lib.progress).toEqual({ 'sample/a.md': 40 });
    expect(lib.session).toBeNull();
    expect(lib.prefs.theme).toBe('light');
    expect(lib.prefs.fontSize).toBe(28);
  });

  it('keeps unknown keys and leaves collections to the core', () => {
    const raw = toRaw(parseLibrary({ version: 1, collections: [{ id: 'x' }], annotations: [{ id: 'a1' }] }));
    expect(raw.annotations).toEqual([{ id: 'a1' }]);
    expect(raw.version).toBe(1);
    expect('collections' in raw).toBe(false);
  });

  it('records recent documents newest first, without duplicates, capped', () => {
    const lib = parseLibrary({});
    addRecent(lib, 'sample/a.md', 1);
    addRecent(lib, 'sample/b.md', 2);
    addRecent(lib, 'sample/a.md', 3);
    expect(lib.recent.map((r) => r.key)).toEqual(['sample/a.md', 'sample/b.md']);
    for (let i = 0; i < 40; i++) addRecent(lib, `sample/${i}.md`, 10 + i);
    expect(lib.recent).toHaveLength(MAX_RECENT);
  });

  it('toggles favorites and favorite collections', () => {
    const lib = parseLibrary({});
    expect(toggleFavorite(lib, 'sample/a.md')).toBe(true);
    expect(lib.favorites).toEqual(['sample/a.md']);
    expect(toggleFavorite(lib, 'sample/a.md')).toBe(false);
    expect(lib.favorites).toEqual([]);
    expect(toggleFavoriteCollection(lib, 'sample')).toBe(true);
    expect(lib.favoriteCollections).toEqual(['sample']);
  });

  it('drops duplicate favorites and recent entries, keeping the first', () => {
    const lib = parseLibrary({
      favorites: ['sample/a.md', 'sample/a.md', 'sample/b.md'],
      favoriteCollections: ['sample', 'sample'],
      recent: [{ key: 'sample/a.md', at: 9 }, { key: 'sample/a.md', at: 1 }, { key: 'sample/b.md', at: 2 }],
    });
    expect(lib.favorites).toEqual(['sample/a.md', 'sample/b.md']);
    expect(lib.favoriteCollections).toEqual(['sample']);
    expect(lib.recent).toEqual([{ key: 'sample/a.md', at: 9 }, { key: 'sample/b.md', at: 2 }]);
  });

  it('keeps the furthest reading progress', () => {
    const lib = parseLibrary({});
    expect(recordProgress(lib, 'sample/a.md', 40.4)).toBe(true);
    expect(recordProgress(lib, 'sample/a.md', 10)).toBe(false);
    expect(lib.progress['sample/a.md']).toBe(40);
  });

  it('builds and splits document keys', () => {
    expect(docKey('abc', 'Guides/x.md')).toBe('abc/Guides/x.md');
    expect(parseKey('abc/Guides/x.md')).toEqual({ collectionId: 'abc', path: 'Guides/x.md' });
  });

  it('treats a key with no collection prefix as all path', () => {
    expect(parseKey('loose.md')).toEqual({ collectionId: '', path: 'loose.md' });
  });

  it('rejects non-finite reading progress', () => {
    const lib = parseLibrary({});
    expect(recordProgress(lib, 'sample/a.md', NaN)).toBe(false);
    expect(recordProgress(lib, 'sample/a.md', Infinity)).toBe(false);
    expect(lib.progress).toEqual({});
  });

  it('treats a non-object library as empty', () => {
    for (const raw of [null, [], 'nope']) {
      const lib = parseLibrary(raw);
      expect(lib.prefs).toEqual(DEFAULT_PREFS);
      expect(lib.favorites).toEqual([]);
      expect(lib.session).toBeNull();
    }
  });

  it('rejects a session with a bad activeCollection or at', () => {
    expect(parseLibrary({ session: { panes: [], split: false, ratio: 0.5, at: 1, activeCollection: 5 } }).session).toBeNull();
    expect(parseLibrary({ session: { panes: [], split: false, ratio: 0.5, at: 'x', activeCollection: null } }).session).toBeNull();
  });

  it('survives untrusted JSON input', () => {
    const raw = JSON.parse(
      '{"__proto__": {"polluted": true}, "progress": {"__proto__": 50, "sample/a.md": 10}, "recent": [{"key": "sample/bad.md", "at": 1e999}], "session": {"panes": [], "split": false, "ratio": 1e999, "at": 1, "activeCollection": null}}',
    );
    const lib = parseLibrary(raw);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty('polluted');
    expect(Object.getPrototypeOf(toRaw(lib))).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(lib.progress, '__proto__')).toBe(false);
    expect(lib.progress).toEqual({ 'sample/a.md': 10 });
    expect(lib.recent).toEqual([]);
    expect(lib.session).toBeNull();
  });

  it('reads bookmarks and searches, dropping bad and repeated entries', () => {
    const lib = parseLibrary({
      bookmarks: [
        { id: 'b1', key: 'sample/a.md', slug: 'x', heading: 'X', at: 1 },
        { id: 'b1', key: 'sample/a.md', slug: 'x', heading: 'X', at: 2 },
        { id: 'b2', key: 3 },
      ],
      searches: [{ q: 'Wi-Fi', at: 2 }, { q: 'wi-fi', at: 1 }, { q: '  ', at: 1 }, { q: 'x', at: NaN }],
    });
    expect(lib.bookmarks.map((b) => b.at)).toEqual([1]);
    expect(lib.searches).toEqual([{ q: 'Wi-Fi', at: 2 }]);
    expect(lib.extra).not.toHaveProperty('bookmarks');
    expect(toRaw(lib).searches).toEqual([{ q: 'Wi-Fi', at: 2 }]);
  });

  it('toggles a bookmark per section', () => {
    const lib = parseLibrary({});
    expect(toggleBookmark(lib, 'sample/a.md', 'setup', 'Setup', 5)).toBe(true);
    expect(toggleBookmark(lib, 'sample/a.md', '', 'a', 6)).toBe(true);
    expect(lib.bookmarks[1]).toEqual({ id: bookmarkId('sample/a.md', 'setup'), key: 'sample/a.md', slug: 'setup', heading: 'Setup', at: 5 });
    expect(toggleBookmark(lib, 'sample/a.md', 'setup', 'Setup')).toBe(false);
    expect(lib.bookmarks.map((b) => b.slug)).toEqual(['']);
  });

  it('remembers searches newest first, once each, capped', () => {
    const lib = parseLibrary({});
    addSearch(lib, ' Wi-Fi ', 1);
    addSearch(lib, '   ', 2);
    addSearch(lib, 'wi-fi', 3);
    expect(lib.searches).toEqual([{ q: 'wi-fi', at: 3 }]);
    for (let i = 0; i < 20; i++) addSearch(lib, `q${i}`, 10 + i);
    expect(lib.searches).toHaveLength(MAX_SEARCHES);
    expect(lib.searches[0].q).toBe('q19');
  });

  it('removes one item or clears a list', () => {
    const lib = parseLibrary({ favorites: ['sample/a.md'], recent: [{ key: 'sample/a.md', at: 1 }], searches: [{ q: 'x', at: 1 }] });
    toggleBookmark(lib, 'sample/a.md', '', 'a');
    removeFromList(lib, 'favorites', 'sample/a.md');
    removeFromList(lib, 'bookmarks', bookmarkId('sample/a.md', ''));
    removeFromList(lib, 'history', 'x');
    expect([lib.favorites, lib.bookmarks, lib.searches]).toEqual([[], [], []]);
    clearList(lib, 'recent');
    expect(lib.recent).toEqual([]);
  });

  it('lists library rows for each tab, skipping unavailable folders', () => {
    const lib = parseLibrary({
      recent: [{ key: 'sample/Guides/Wi-Fi.md', at: 9 }, { key: 'gone/x.md', at: 8 }],
      favorites: ['sample/README.md'],
      progress: { 'sample/Guides/Wi-Fi.md': 40 },
    });
    toggleBookmark(lib, 'sample/README.md', 'setup', 'Setup', 7);
    const known = (k: string) => k.startsWith('sample/');
    expect(libraryRows(lib, 'recent', known)).toEqual([
      { id: 'sample/Guides/Wi-Fi.md', key: 'sample/Guides/Wi-Fi.md', slug: null, heading: null, title: 'Wi Fi', progress: 40, when: 9 },
    ]);
    expect(libraryRows(lib, 'favorites', known)[0]).toMatchObject({ key: 'sample/README.md', when: null });
    expect(libraryRows(lib, 'bookmarks', known)[0]).toMatchObject({ slug: 'setup', heading: 'Setup', when: 7 });
    expect(libraryRows(lib, 'progress', known)[0]).toMatchObject({ key: 'sample/Guides/Wi-Fi.md', when: 9 });
  });

  it('filters and sorts rows, keeping undated rows in list order', () => {
    const row = (key: string, progress: number, when: number | null): LibraryRow =>
      ({ id: key, key, slug: null, heading: null, title: key, progress, when });
    const rows = [row('b', 10, null), row('a', 50, 2), row('c', 0, null), row('d', 5, 9)];
    const loc = (k: string) => `Folder › ${k}`;
    expect(arrangeRows(rows, '', 'recent', loc).map((r) => r.key)).toEqual(['d', 'a', 'b', 'c']);
    expect(arrangeRows(rows, '', 'title', loc).map((r) => r.key)).toEqual(['a', 'b', 'c', 'd']);
    expect(arrangeRows(rows, '', 'progress', loc).map((r) => r.key)).toEqual(['a', 'b', 'd', 'c']);
    expect(arrangeRows(rows, 'FOLDER › C', 'title', loc).map((r) => r.key)).toEqual(['c']);
  });

  it('reads allowed picture sites as unique lower-case hosts', () => {
    const lib = parseLibrary({ allowedImageSites: ['Images.Example.org', 'images.example.org', 7, ''] });
    expect(lib.allowedImageSites).toEqual(['images.example.org']);
    expect(lib.extra).not.toHaveProperty('allowedImageSites');
  });

  it('allows and forbids a picture site', () => {
    const lib = parseLibrary({});
    allowSite(lib, 'Images.Example.org');
    allowSite(lib, 'images.example.org');
    expect(lib.allowedImageSites).toEqual(['images.example.org']);
    forbidSite(lib, 'IMAGES.example.org');
    expect(lib.allowedImageSites).toEqual([]);
  });

  it('clears history but keeps favorites, bookmarks and settings', () => {
    const lib = parseLibrary({ favorites: ['s/a.md'], recent: [{ key: 's/a.md', at: 1 }], searches: [{ q: 'x', at: 1 }], progress: { 's/a.md': 50 }, prefs: { fontSize: 20 } });
    toggleBookmark(lib, 's/a.md', '', 'a');
    clearHistory(lib);
    expect([lib.recent, lib.searches, lib.progress]).toEqual([[], [], {}]);
    expect(lib.favorites).toEqual(['s/a.md']);
    expect(lib.bookmarks).toHaveLength(1);
    expect(lib.prefs.fontSize).toBe(20);
  });

  it('reset empties everything Markvy remembers but keeps keys it does not own', () => {
    const lib = parseLibrary({ favorites: ['s/a.md'], favoriteCollections: ['s'], allowedImageSites: ['x.org'], prefs: { fontSize: 20 }, annotations: [1],
      session: { split: false, ratio: 0.5, activeCollection: 's', at: 1, panes: [] } });
    resetLibrary(lib);
    expect(lib).toMatchObject({ favorites: [], favoriteCollections: [], bookmarks: [], recent: [], searches: [], progress: {}, allowedImageSites: [], session: null, prefs: DEFAULT_PREFS });
    expect(lib.extra).toEqual({ annotations: [1] });
  });
});
