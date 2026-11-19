import { friendlyName } from './markdown/slug';
import { DEFAULT_PREFS, normalizePrefs, type Prefs } from './prefs';
import type { Session } from './workspace';

export interface RecentEntry { key: string; at: number }
/** A section saved to come back to. `slug` is '' for the top of the document. */
export interface Bookmark { id: string; key: string; slug: string; heading: string; at: number }
export interface SearchEntry { q: string; at: number }

export interface LibraryData {
  prefs: Prefs;
  favorites: string[];
  favoriteCollections: string[];
  recent: RecentEntry[];
  bookmarks: Bookmark[];
  searches: SearchEntry[];
  progress: Record<string, number>;
  session: Session | null;
  allowedImageSites: string[];
  /** Keys this version doesn't manage (later plans' data), kept so a save never drops them. */
  extra: Record<string, unknown>;
}

export const MAX_RECENT = 30;
export const MAX_SEARCHES = 15;
const OWNED = ['prefs', 'favorites', 'favoriteCollections', 'recent', 'bookmarks', 'searches', 'progress', 'session', 'allowedImageSites', 'version', 'collections'];

export const docKey = (collectionId: string, path: string) => `${collectionId}/${path}`;

export function parseKey(key: string): { collectionId: string; path: string } {
  const i = key.indexOf('/');
  if (i < 0) return { collectionId: '', path: key };
  return { collectionId: key.slice(0, i), path: key.slice(i + 1) };
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

const isRecent = (r: unknown): r is RecentEntry =>
  !!r && typeof r === 'object' && typeof (r as RecentEntry).key === 'string' && Number.isFinite((r as RecentEntry).at);

const isBookmark = (v: unknown): v is Bookmark => {
  const b = v as Bookmark;
  return !!b && typeof b === 'object' && typeof b.id === 'string' && typeof b.key === 'string'
    && typeof b.slug === 'string' && typeof b.heading === 'string' && Number.isFinite(b.at);
};

const isSearch = (v: unknown): v is SearchEntry => {
  const s = v as SearchEntry;
  return !!s && typeof s === 'object' && typeof s.q === 'string' && !!s.q.trim() && Number.isFinite(s.at);
};

const isSession = (v: unknown): v is Session => {
  const s = v as Session;
  return !!s && typeof s === 'object' && Array.isArray(s.panes) && typeof s.split === 'boolean' && Number.isFinite(s.ratio)
    && typeof s.at === 'number' && (s.activeCollection === null || typeof s.activeCollection === 'string');
};

/** Keeps the first item for each id. Keyed lists in the UI need unique keys. */
function uniqueBy<T>(items: T[], id: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const k = id(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function parseLibrary(input: unknown): LibraryData {
  const raw = (input && typeof input === 'object' && !Array.isArray(input) ? input : {}) as Record<string, unknown>;
  const progress: Record<string, number> = {};
  if (raw.progress && typeof raw.progress === 'object') {
    for (const [k, v] of Object.entries(raw.progress)) {
      if (k !== '__proto__' && typeof v === 'number' && v >= 0 && v <= 100) progress[k] = v;
    }
  }
  return {
    prefs: normalizePrefs(raw.prefs),
    favorites: uniqueBy(strings(raw.favorites), (k) => k),
    favoriteCollections: uniqueBy(strings(raw.favoriteCollections), (k) => k),
    recent: uniqueBy(Array.isArray(raw.recent) ? raw.recent.filter(isRecent) : [], (r) => r.key).slice(0, MAX_RECENT),
    bookmarks: uniqueBy(Array.isArray(raw.bookmarks) ? raw.bookmarks.filter(isBookmark) : [], (b) => b.id),
    searches: uniqueBy(Array.isArray(raw.searches) ? raw.searches.filter(isSearch) : [], (s) => s.q.toLowerCase()).slice(0, MAX_SEARCHES),
    progress,
    session: isSession(raw.session) ? raw.session : null,
    allowedImageSites: uniqueBy(strings(raw.allowedImageSites).map((h) => h.trim().toLowerCase()).filter(Boolean), (h) => h),
    extra: Object.fromEntries(Object.entries(raw).filter(([k]) => !OWNED.includes(k))),
  };
}

/** The JSON sent to `save_library`. The core adds `collections` itself. */
export function toRaw(lib: LibraryData): Record<string, unknown> {
  const { extra, ...owned } = lib;
  return { ...extra, ...owned, version: 1 };
}

export function addRecent(lib: LibraryData, key: string, now = Date.now()): void {
  lib.recent = [{ key, at: now }, ...lib.recent.filter((r) => r.key !== key)].slice(0, MAX_RECENT);
}

export function toggleFavorite(lib: LibraryData, key: string): boolean {
  const on = lib.favorites.includes(key);
  lib.favorites = on ? lib.favorites.filter((k) => k !== key) : [key, ...lib.favorites];
  return !on;
}

export function toggleFavoriteCollection(lib: LibraryData, id: string): boolean {
  const on = lib.favoriteCollections.includes(id);
  lib.favoriteCollections = on ? lib.favoriteCollections.filter((k) => k !== id) : [...lib.favoriteCollections, id];
  return !on;
}

/** Keeps the furthest point read. Returns true when it changed, so the caller knows to save. */
export function recordProgress(lib: LibraryData, key: string, pct: number): boolean {
  if (!Number.isFinite(pct)) return false;
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  if (p <= (lib.progress[key] ?? 0)) return false;
  lib.progress[key] = p;
  return true;
}

export const bookmarkId = (key: string, slug: string) => `${key}#${slug}`;

/** Adds or removes the bookmark for one section. Returns true when it was added. */
export function toggleBookmark(lib: LibraryData, key: string, slug: string, heading: string, now = Date.now()): boolean {
  const same = (b: Bookmark) => b.key === key && b.slug === slug;
  const on = lib.bookmarks.some(same);
  lib.bookmarks = on ? lib.bookmarks.filter((b) => !same(b)) : [{ id: bookmarkId(key, slug), key, slug, heading, at: now }, ...lib.bookmarks];
  return !on;
}

export function addSearch(lib: LibraryData, q: string, now = Date.now()): void {
  const text = q.trim();
  if (!text) return;
  lib.searches = [{ q: text, at: now }, ...lib.searches.filter((s) => s.q.toLowerCase() !== text.toLowerCase())].slice(0, MAX_SEARCHES);
}

export type ListKind = 'recent' | 'favorites' | 'bookmarks' | 'history';

/** Removes one entry from a Library list. `id` is a document key, a bookmark id, or the search text. */
export function removeFromList(lib: LibraryData, kind: ListKind, id: string): void {
  if (kind === 'recent') lib.recent = lib.recent.filter((r) => r.key !== id);
  else if (kind === 'favorites') lib.favorites = lib.favorites.filter((k) => k !== id);
  else if (kind === 'bookmarks') lib.bookmarks = lib.bookmarks.filter((b) => b.id !== id);
  else lib.searches = lib.searches.filter((s) => s.q !== id);
}

export function clearList(lib: LibraryData, kind: 'recent' | 'bookmarks' | 'history'): void {
  if (kind === 'recent') lib.recent = [];
  else if (kind === 'bookmarks') lib.bookmarks = [];
  else lib.searches = [];
}

export function allowSite(lib: LibraryData, host: string): void {
  const h = host.trim().toLowerCase();
  if (h && !lib.allowedImageSites.includes(h)) lib.allowedImageSites = [...lib.allowedImageSites, h];
}

export function forbidSite(lib: LibraryData, host: string): void {
  const h = host.trim().toLowerCase();
  lib.allowedImageSites = lib.allowedImageSites.filter((s) => s !== h);
}

/** "Clear history": recent documents, searches and reading progress. Favorites, bookmarks and settings stay. */
export function clearHistory(lib: LibraryData): void {
  lib.recent = [];
  lib.searches = [];
  lib.progress = {};
}

/** "Reset workspace" (amendment A9): everything Markvy remembers about reading. Folders and other plans' keys stay. */
export function resetLibrary(lib: LibraryData): void {
  Object.assign(lib, {
    prefs: { ...DEFAULT_PREFS }, favorites: [], favoriteCollections: [], bookmarks: [], recent: [], searches: [],
    progress: {}, session: null, allowedImageSites: [],
  });
}

export type LibraryTab = 'recent' | 'favorites' | 'bookmarks' | 'progress';
export type LibrarySort = 'recent' | 'title' | 'location' | 'progress';
export interface LibraryRow { id: string; key: string; slug: string | null; heading: string | null; title: string; progress: number; when: number | null }

/** The rows of one Library tab. `when` is when it was opened (or bookmarked); favorites keep their own order. */
export function libraryRows(lib: LibraryData, tab: LibraryTab, known: (key: string) => boolean): LibraryRow[] {
  const row = (key: string, id: string, when: number | null, b?: Bookmark): LibraryRow => ({
    id, key, slug: b ? b.slug : null, heading: b ? b.heading : null,
    title: friendlyName(parseKey(key).path), progress: lib.progress[key] ?? 0, when,
  });
  const opened = (key: string) => lib.recent.find((r) => r.key === key)?.at ?? null;
  if (tab === 'recent') return lib.recent.filter((r) => known(r.key)).map((r) => row(r.key, r.key, r.at));
  if (tab === 'favorites') return lib.favorites.filter(known).map((k) => row(k, k, null));
  if (tab === 'bookmarks') return lib.bookmarks.filter((b) => known(b.key)).map((b) => row(b.key, b.id, b.at, b));
  return Object.keys(lib.progress).filter(known).map((k) => row(k, k, opened(k)));
}

/** Filters by title, section and location, then sorts. "Most recent" keeps undated rows in list order, last. */
export function arrangeRows(rows: LibraryRow[], filter: string, sort: LibrarySort, location: (key: string) => string): LibraryRow[] {
  const q = filter.trim().toLowerCase();
  const kept = q ? rows.filter((r) => `${r.title} ${r.heading ?? ''} ${location(r.key)}`.toLowerCase().includes(q)) : rows;
  const by: Record<LibrarySort, (a: LibraryRow, b: LibraryRow) => number> = {
    recent: (a, b) => (b.when ?? -Infinity) - (a.when ?? -Infinity),
    title: (a, b) => (a.heading ?? a.title).localeCompare(b.heading ?? b.title),
    location: (a, b) => location(a.key).localeCompare(location(b.key)),
    progress: (a, b) => b.progress - a.progress,
  };
  return [...kept].sort(by[sort]);
}
