import { SvelteSet } from 'svelte/reactivity';
import { assetUrl, core as realCore, describeError, errorDetails, filesOf, firstDocument, isAppError, MESSAGES, type AppError, type Collection, type CollectionChanged, type DocumentText, type Draft, type IndexProgress, type Recovered, type SearchResult, type SearchScope, type Tree } from '../lib/core';
import { addRecent, addSearch, allowSite, clearHistory, clearList, docKey, forbidSite, parseKey, parseLibrary, recordProgress, removeFromList, resetLibrary, toggleBookmark, toggleFavorite, toggleFavoriteCollection, toRaw, type LibraryData, type ListKind } from '../lib/library';
import { planRename } from '../lib/editor/linkedit';
import { friendlyName } from '../lib/markdown/slug';
import { applyPrefs, DEFAULT_PREFS, isDark, normalizePrefs, type Prefs } from '../lib/prefs';
import { dataUrl, hostOf } from '../lib/remote';
import { EditSession } from './edit.svelte';
import { createSaver, type Saver } from '../lib/saver';
import type { HeadingInfo } from '../lib/toc';
import * as W from '../lib/workspace';

export type CoreApi = typeof realCore;
export type FileAction =
  | { kind: 'new-page' | 'new-folder'; cid: string; folder: string }
  | { kind: 'rename' | 'delete'; cid: string; path: string; isFolder: boolean };
export type View = 'home' | 'reader' | 'prefs' | 'search' | 'library' | 'help';
export type ScopeKind = 'all' | 'collection' | 'document';
/** Highlights for a search result opened in a pane. */
/** `applied`: the reader has already scrolled to the first match; a remount (live reload) then keeps its place. */
export interface FindState { key: string; q: string; wholeWords: boolean; slug: string | null; applied?: boolean }
export { assetUrl };

const systemDark = () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
const systemReducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export class AppStore {
  collections = $state<Collection[]>([]);
  trees = $state<Record<string, Tree>>({});
  activeCollection = $state<string | null>(null);
  library = $state<LibraryData>(parseLibrary({}));
  ws = $state<W.WorkspaceState>(W.emptyWorkspace());
  view = $state<View>('home');
  sidebarOpen = $state(true);
  tocOpen = $state(true);
  notice = $state<string | null>(null);
  headings = $state<[HeadingInfo[], HeadingInfo[]]>([[], []]);
  currentSlugs = $state<[string | null, string | null]>([null, null]);
  liveProgress = $state<[number, number]>([0, 0]);
  /** The session found at start-up, offered on Home. Later saves don't replace it. */
  savedSession = $state<W.Session | null>(null);
  dark = $state(false);
  reducedMotion = $state(false);
  closedFolders = new SvelteSet<string>();
  /** Collections whose last tree load failed, so the sidebar can offer a retry. */
  failedTrees = new SvelteSet<string>();
  /** The Search screen's form. */
  query = $state({ q: '', scope: 'all' as ScopeKind, headingsOnly: false, wholeWords: false, folder: '' });
  /** null until a search has run. */
  results = $state<SearchResult[] | null>(null);
  /** The query the shown results came from, so editing the box doesn't change them. */
  resultsQuery = $state<{ q: string; wholeWords: boolean } | null>(null);
  /** True when the last search ran while a folder was still being indexed. */
  searchIndexing = $state(false);
  find = $state<[FindState | null, FindState | null]>([null, null]);
  /** Bumped when a document changes on disk, so open views of it reload. */
  versions = $state<Record<string, number>>({});
  indexing = $state<Record<string, IndexProgress>>({});
  /** The document whose details dialog is open. */
  detailsKey = $state<string | null>(null);
  /** The error behind the current notice, for "Copy details". */
  lastError = $state<AppError | null>(null);
  /** A website or email link waiting for the reader's go-ahead. */
  externalUrl = $state<string | null>(null);
  brokenLink = $state<{ target: string; collectionId: string } | null>(null);
  /** A picture from the internet the reader asked to review. */
  imageReview = $state<{ url: string; alt: string } | null>(null);
  /** Pictures shown in this run of Markvy, by address (data: URLs). */
  shownImages = $state<Record<string, string>>({});
  helpOpen = $state(false);
  private loadingImages = new Set<string>();
  /** Bumped when pictures are blocked or the workspace is reset, so a fetch already in flight can't show afterwards. */
  private imageGen = 0;
  /** Pictures that failed to load in this run: no repeat tries until the reader asks again. */
  private failedImages = new Set<string>();
  private searchSeq = 0;
  private treeSeq = new Map<string, number>();
  /** Each mounted document view registers how to scroll to a heading. */
  scrollers: [((slug: string) => void) | null, ((slug: string) => void) | null] = [null, null];

  private docs = new Map<string, Promise<DocumentText>>();
  private treeLoads = new Map<string, Promise<Tree | null>>();
  /** True once start-up has finished, so Home never acts on a half-loaded library. */
  ready = $state(false);
  private canSave = false;
  private persistAfterInit = false;
  /** False while the session on disk is the one loaded at start-up; true once the user opens or restores one. */
  private sessionLive = false;
  private saver: Saver;
  sessions = $state<Record<string, EditSession>>({});
  drafts = $state<Record<string, Draft>>({});

  constructor(readonly api: CoreApi = realCore) {
    this.saver = createSaver(
      () => this.api.saveLibrary(toRaw($state.snapshot(this.snapshotLibrary()) as LibraryData)),
      1000,
      (e) => this.report(e),
    );
  }

  get currentKey(): string | null {
    return W.activeKey(this.ws);
  }

  async init(): Promise<void> {
    this.subscribe();
    let libraryLoaded = false;
    try {
      const loaded = await this.api.loadLibrary();
      this.library = parseLibrary(loaded.library);
      this.savedSession = this.library.session;
      libraryLoaded = true;
      if (loaded.reset) this.notice = MESSAGES.LibraryReset;
    } catch (e) {
      this.report(e); // canSave stays false: the core refused, so nothing is written over it
    }
    this.applyPrefs();
    void this.api.setEditingAllowed(this.library.prefs.allowEditing).catch(() => {});
    this.drafts = Object.fromEntries((await this.api.listDrafts().catch(() => [])).map((d) => [docKey(d.collectionId, d.path), d]));
    try {
      this.collections = await this.api.listCollections();
    } catch (e) {
      this.report(e);
    }
    const preferred = this.library.session?.activeCollection;
    const start = this.collections.find((c) => c.id === preferred && c.available) ?? this.collections.find((c) => c.available);
    this.activeCollection ??= start?.id ?? null; // keep a folder the reader already opened during start-up
    if (this.activeCollection) await this.ensureTree(this.activeCollection);
    this.canSave = libraryLoaded; // only a library the core has read, and only once start-up is done, may be written back
    this.ready = true;
    if (this.canSave && this.persistAfterInit) this.saver.schedule();
    await this.recover();
  }

  /** Right after a crash reload (spec §5, amendment A12): bring the tabs back, unless this was a repeat crash. */
  private async recover(): Promise<void> {
    let rec: Recovered | null = null;
    try {
      rec = await this.api.takeRecovery();
    } catch {
      return; // the check failing must never stop Markvy from starting
    }
    if (!rec) return;
    if (!rec.restoreSession) {
      this.notice = MESSAGES.RecoveredFresh;
      return;
    }
    // Only a session this run saved is the reader's own tabs; an older one is just what Home offers.
    const saved = this.savedSession;
    if (saved && saved.at >= rec.startedAtMs) {
      if (this.restoreSession()) {
        this.notice = MESSAGES.RecoveredRestored;
        return;
      }
    }
    this.notice = MESSAGES.Recovered;
  }

  async ensureTree(cid: string): Promise<Tree | null> {
    if (this.trees[cid]) return this.trees[cid];
    let pending = this.treeLoads.get(cid);
    if (!pending) {
      this.failedTrees.delete(cid);
      // Deferred so the entry is stored before a load can settle and clear it.
      pending = Promise.resolve()
        .then(() => this.api.getTree(cid))
        .then(
          (tree) => {
            this.failedTrees.delete(cid);
            this.trees[cid] = tree;
            if (tree.truncated) this.notice = MESSAGES.TreeTruncated;
            return tree;
          },
          (e) => {
            this.failedTrees.add(cid);
            this.report(e);
            return null;
          },
        )
        .finally(() => this.treeLoads.delete(cid));
      this.treeLoads.set(cid, pending);
    }
    return pending;
  }

  filesFor(cid: string): string[] {
    const tree = this.trees[cid];
    return tree ? filesOf(tree.root) : [];
  }

  loadDocument(key: string): Promise<DocumentText> {
    let pending = this.docs.get(key);
    if (!pending) {
      const { collectionId, path } = parseKey(key);
      pending = this.api.readDocument(collectionId, path);
      pending.catch(() => this.docs.delete(key)); // a failed read is retried next time
      this.docs.set(key, pending);
    }
    return pending;
  }

  /** Edit mode for a document: fails with a message for the Sample library, editing off, or text that can't be saved back exactly. */
  async startEditing(key: string): Promise<void> {
    if (this.sessions[key]) return;
    const { collectionId, path } = parseKey(key);
    try {
      const source = await this.api.openForEdit(collectionId, path);
      const draft = this.drafts[key] ?? (await this.api.takeDraft(collectionId, path));
      this.sessions[key] = new EditSession(this.api, key, source, draft);
      delete this.drafts[key];
    } catch (e) {
      this.report(e);
    }
  }

  /** Leaving edit mode: save, keep the draft, or discard (the dialog confirms a discard first). */
  async stopEditing(key: string, choice: 'save' | 'keep' | 'discard'): Promise<boolean> {
    const s = this.sessions[key];
    if (!s) return true;
    if (choice === 'save' && !(await s.save())) return false;
    if (choice === 'discard') await s.discard();
    else if (s.state !== 'clean') {
      await s.flushDraft(); // text typed during a save, or a draft that failed: never dropped silently
      if (s.draftFailing) { this.notice = MESSAGES.DraftsFailing; return false; }
      // The reader offers the kept draft back (banner, Home) without waiting for a restart.
      const { collectionId, path } = parseKey(key);
      this.drafts[key] = { collectionId, path, baseHash: s.baseHash, text: s.text, savedAt: s.draftAt ?? Date.now() };
    }
    s.dispose();
    delete this.sessions[key];
    this.clearChangedNotice();
    this.invalidate(key);
    this.versions[key] = (this.versions[key] ?? 0) + 1;
    return true;
  }

  /** Forgets a cached document so the next load reads it from disk. */
  invalidate(key: string): void {
    this.docs.delete(key);
  }

  selectCollection(cid: string): void {
    this.activeCollection = cid;
    void this.ensureTree(cid);
  }

  async openCollection(cid: string): Promise<void> {
    this.activeCollection = cid;
    const tree = await this.ensureTree(cid);
    const first = tree ? firstDocument(tree.root) : null;
    if (first) this.open(docKey(cid, first));
  }

  async addFolder(): Promise<void> {
    try {
      const picked = await this.api.pickFolder();
      if (!picked) return;
      this.collections = await this.api.listCollections();
      await this.openCollection(picked.id);
    } catch (e) {
      this.report(e);
    }
  }

  async openFile(): Promise<void> {
    try {
      const picked = await this.api.pickFile();
      if (!picked) return;
      this.collections = await this.api.listCollections();
      this.open(docKey(picked.collection.id, picked.path));
    } catch (e) {
      this.report(e);
    }
  }

  openSample(): void {
    void this.openCollection('sample');
  }

  open(key: string, opts: { mode?: W.OpenMode; pane?: W.PaneIndex; slug?: string | null } = {}): void {
    this.invalidate(key); // an explicit open re-reads from disk; switching tabs keeps the cache
    this.sessionLive = true;
    const { collectionId } = parseKey(key);
    this.activeCollection = collectionId;
    void this.ensureTree(collectionId);
    W.openDoc(this.ws, key, { mode: opts.mode ?? 'tab', pane: opts.pane ?? this.ws.activePane, slug: opts.slug ?? null });
    addRecent(this.library, key);
    this.view = 'reader';
    this.persist();
  }

  openBeside(key: string, slug: string | null = null): void {
    const from = this.ws.split ? this.ws.activePane : 0;
    if (!this.ws.split) W.setSplit(this.ws, true, null);
    this.open(key, { mode: 'tab', pane: from === 0 ? 1 : 0, slug });
  }

  goBack(pane: W.PaneIndex): void {
    if (W.go(this.ws, pane, -1)) this.persist();
  }

  goForward(pane: W.PaneIndex): void {
    if (W.go(this.ws, pane, 1)) this.persist();
  }

  activateTab(pane: W.PaneIndex, id: number): void {
    W.activateTab(this.ws, pane, id);
    this.persist();
  }

  closeTab(pane: W.PaneIndex, id: number): void {
    const closing = this.ws.panes[pane].tabs.find((t) => t.id === id);
    const key = closing ? W.current(closing).key : null;
    W.closeTab(this.ws, pane, id);
    const stillShown = this.ws.panes.some((p) => p.tabs.some((t) => W.current(t).key === key));
    if (key && !stillShown) this.invalidate(key);
    this.persist();
  }

  activatePane(pane: W.PaneIndex): void {
    if (this.ws.split) this.ws.activePane = pane;
  }

  setSplit(on: boolean): void {
    let companion: string | null = null;
    if (on) {
      const cur = W.activeKey(this.ws);
      const cid = cur ? parseKey(cur).collectionId : this.activeCollection;
      companion = cid ? this.filesFor(cid).filter((p) => /\.(md|markdown|txt)$/i.test(p)).map((p) => docKey(cid, p)).find((k) => k !== cur) ?? null : null;
    }
    W.setSplit(this.ws, on, companion);
    this.view = 'reader';
    this.persist();
  }

  setRatio(r: number): void {
    W.setRatio(this.ws, r);
    this.persist();
  }

  toggleSidebar(): void {
    if (this.view === 'home') {
      this.view = 'reader';
      this.sidebarOpen = true;
    } else this.sidebarOpen = !this.sidebarOpen;
  }

  toggleToc(): void {
    this.tocOpen = !this.tocOpen;
  }

  toggleFolder(cid: string, path: string): void {
    const id = `${cid}:${path}`;
    if (this.closedFolders.has(id)) this.closedFolders.delete(id);
    else this.closedFolders.add(id);
  }

  revealFolder(cid: string, folder: string): void {
    this.activeCollection = cid;
    this.sidebarOpen = true;
    const parts = folder ? folder.split('/') : [];
    parts.forEach((_, i) => this.closedFolders.delete(`${cid}:${parts.slice(0, i + 1).join('/')}`));
  }

  toggleFavorite(key: string): void {
    toggleFavorite(this.library, key);
    this.persist();
  }

  toggleFavoriteCollection(id: string): void {
    toggleFavoriteCollection(this.library, id);
    this.persist();
  }

  setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): void {
    this.library.prefs = normalizePrefs({ ...this.library.prefs, [key]: value });
    if (key === 'remoteImages' && value === 'block') {
      this.imageGen++;
      this.shownImages = {};
      this.failedImages.clear();
    }
    if (key === 'allowEditing') void this.api.setEditingAllowed(value as boolean).catch(() => {});
    this.applyPrefs();
    this.persist();
  }

  /** "Allow editing". Turning it off first ends every edit session, keeping its draft while the core still allows the write;
   *  if a draft can't be written, editing stays on (stopEditing shows why). */
  async setAllowEditing(on: boolean): Promise<boolean> {
    if (!on) for (const key of Object.keys(this.sessions)) if (!(await this.stopEditing(key, 'keep'))) return false;
    this.setPref('allowEditing', on);
    return true;
  }

  /** "Restore default settings" (Preferences): reading settings only; the privacy choices in Privacy & Help stay. */
  resetPrefs(): void {
    const { extLinks, remoteImages } = this.library.prefs;
    this.library.prefs = { ...DEFAULT_PREFS, extLinks, remoteImages };
    void this.api.setEditingAllowed(this.library.prefs.allowEditing).catch(() => {});
    this.applyPrefs();
    this.persist();
  }

  applyPrefs(): void {
    const prefs = this.library.prefs;
    if (typeof document !== 'undefined') applyPrefs(prefs, document.documentElement, systemDark());
    this.dark = isDark(prefs, systemDark());
    this.reducedMotion = prefs.reduceMotion || systemReducedMotion();
  }

  /** True when at least one saved tab came back. */
  restoreSession(): boolean {
    const session = this.savedSession;
    if (!session) return false;
    const known = (key: string) => this.collections.some((c) => c.available && c.id === parseKey(key).collectionId);
    this.ws = W.fromSession(session, known);
    if (!this.ws.panes.some((p) => p.tabs.length)) {
      this.startFresh(); // nothing survived: open the first document rather than a blank reader
      return false;
    }
    for (const pane of this.ws.panes) for (const tab of pane.tabs) void this.ensureTree(parseKey(W.current(tab).key).collectionId);
    this.view = 'reader';
    this.sessionLive = true;
    this.persist();
    return true;
  }

  startFresh(): void {
    this.sessionLive = true;
    this.ws = W.emptyWorkspace();
    const cid = this.activeCollection ?? this.collections.find((c) => c.available)?.id;
    if (cid) void this.openCollection(cid);
    else this.view = 'reader';
    this.persist();
  }

  reportScroll(pane: W.PaneIndex, key: string, pct: number, slug: string | null): void {
    this.liveProgress[pane] = pct;
    this.currentSlugs[pane] = slug;
    recordProgress(this.library, key, pct);
    this.persist(); // the scroll position is part of the session
  }

  /** Core events: live reload, indexing progress and folders that go away. Listening starts before anything loads. */
  private subscribe(): void {
    void this.api.onCollectionChanged((c) => this.applyChange(c));
    void this.api.onIndexProgress((p) => this.onIndexProgress(p));
    void this.api.onCollectionUnavailable((id) => void this.onUnavailable(id));
    void this.api.onCloseRequested(() => void this.flushAll().finally(() => this.api.closeReady()));
  }

  /** The scope sent to the core. "This document" or "this folder" fall back to everywhere when there is none. */
  scopeFor(kind: ScopeKind): SearchScope {
    const key = this.currentKey;
    if (kind === 'document' && key) {
      const { collectionId, path } = parseKey(key);
      return { kind: 'document', collectionId, path };
    }
    if (kind === 'collection' && this.activeCollection) return { kind: 'collection', collectionId: this.activeCollection };
    return { kind: 'all' };
  }

  /** Searches the box's text (the Search button), or `q` when a re-run passes the submitted text. */
  async runSearch(q = this.query.q): Promise<void> {
    const seq = ++this.searchSeq;
    const { scope, headingsOnly, wholeWords, folder } = this.query;
    if (!q.trim()) {
      this.results = null;
      this.resultsQuery = null;
      this.searchIndexing = false;
      return;
    }
    try {
      const res = await this.api.search(q, this.scopeFor(scope), { headingsOnly, wholeWords, folder: scope === 'collection' ? folder : '' });
      if (seq !== this.searchSeq) return; // a newer search has started
      this.results = res.results;
      this.resultsQuery = { q, wholeWords };
      this.searchIndexing = res.indexing;
    } catch (e) {
      if (seq !== this.searchSeq) return;
      this.results = [];
      this.resultsQuery = { q, wholeWords };
      this.report(e);
    }
  }

  /** Runs the search that produced the current results again (a file changed, indexing finished, an option changed). */
  rerunSearch(): Promise<void> {
    return this.resultsQuery ? this.runSearch(this.resultsQuery.q) : Promise.resolve();
  }

  /** Runs a search from the search box or a history chip, remembers it, and shows the Search screen. */
  searchFor(q: string): void {
    this.query.q = q;
    this.rememberSearch(q);
    this.view = 'search';
    void this.runSearch();
  }

  /** The search box's suggestions: a quick search everywhere. */
  suggest(q: string): Promise<SearchResult[]> {
    return this.api.search(q, { kind: 'all' }, { headingsOnly: false, wholeWords: false, folder: '' }).then((r) => r.results, () => []);
  }

  rememberSearch(q: string): void {
    addSearch(this.library, q);
    this.persist();
  }

  /**
   * Opens a search result and highlights the query in it, starting at the matching section.
   * Without `q` it is a result on the Search screen: the submitted query and its options. With `q` it is a search-box suggestion.
   */
  openResult(key: string, slug: string | null, q?: string): void {
    const ran = q === undefined ? (this.resultsQuery ?? { q: this.query.q, wholeWords: this.query.wholeWords }) : { q, wholeWords: false };
    this.rememberSearch(ran.q);
    const pane = this.ws.split ? this.ws.activePane : 0;
    this.find[pane] = { key, q: ran.q, wholeWords: ran.wholeWords, slug };
    this.open(key, { slug });
  }

  clearFind(pane: W.PaneIndex): void {
    this.find[pane] = null;
  }

  /** The toolbar's "Search in this document". */
  searchInDocument(pane: W.PaneIndex): void {
    this.activatePane(pane);
    this.query.scope = 'document';
    this.results = null;
    this.view = 'search';
  }

  isBookmarked(pane: W.PaneIndex): boolean {
    const key = W.activeKey(this.ws, pane);
    const slug = this.currentSlugs[pane] ?? '';
    return !!key && this.library.bookmarks.some((b) => b.key === key && b.slug === slug);
  }

  /** Bookmarks the section being read in a pane (or the top of the document), or removes that bookmark. */
  toggleBookmark(pane: W.PaneIndex): void {
    const key = W.activeKey(this.ws, pane);
    if (!key) return;
    const slug = this.currentSlugs[pane] ?? '';
    const heading = this.headings[pane].find((h) => h.slug === slug)?.text.trim() || friendlyName(parseKey(key).path);
    const added = toggleBookmark(this.library, key, slug, heading);
    this.notice = added ? `Bookmarked “${heading}”` : `Bookmark removed: “${heading}”`;
    this.persist();
  }

  removeFromList(kind: ListKind, id: string): void {
    removeFromList(this.library, kind, id);
    this.notice = 'Removed from the list. The document itself is unchanged.';
    this.persist();
  }

  clearList(kind: 'recent' | 'bookmarks' | 'history'): void {
    clearList(this.library, kind);
    this.notice = 'List cleared.';
    this.persist();
  }

  showDetails(key: string | null): void {
    this.detailsKey = key;
  }

  /** A file changed on disk: refresh the folder's tree, and reload every open view of a changed document. */
  applyChange(change: CollectionChanged): void {
    void this.refreshTree(change.collectionId);
    // An empty list means the core missed events: any open document of the folder may have changed.
    const paths = change.changes.length
      ? change.changes.map((c) => c.path)
      : this.ws.panes.flatMap((p) => p.tabs.map((t) => W.current(t).key)).filter((k) => parseKey(k).collectionId === change.collectionId).map((k) => parseKey(k).path);
    for (const path of new Set(paths)) {
      const key = docKey(change.collectionId, path);
      if (this.sessions[key]) {
        const s = this.sessions[key];
        void (async () => {
          await s.settled(); // our own write settles first, so it never reads as an outside change
          const h = await this.api.fileFingerprint(change.collectionId, path);
          if (this.sessions[key] === s && !s.isOwnSave(h)) this.notice = MESSAGES.ChangedOnDisk;
        })().catch(() => {});
        continue;
      }
      this.invalidate(key);
      this.versions[key] = (this.versions[key] ?? 0) + 1;
    }
    if (this.view === 'search' && this.results) void this.rerunSearch();
  }

  /**
   * Reloads a folder tree already shown or loading; keeps the old one if the reload fails (the next change tries again).
   * Only the latest refresh may write, and not after the folder went away.
   */
  async refreshTree(cid: string): Promise<void> {
    const seq = this.bumpTreeSeq(cid);
    const pending = this.treeLoads.get(cid);
    const loaded = pending ? await pending : this.trees[cid]; // a first load in flight finishes before we refetch
    if (!loaded || seq !== this.treeSeq.get(cid)) return; // never shown, or a newer refresh / onUnavailable took over
    try {
      const tree = await this.api.getTree(cid);
      if (seq !== this.treeSeq.get(cid) || !this.trees[cid]) return;
      this.trees[cid] = tree;
      this.failedTrees.delete(cid);
    } catch {
      /* keep the tree we have */
    }
  }

  private bumpTreeSeq(cid: string): number {
    const seq = (this.treeSeq.get(cid) ?? 0) + 1;
    this.treeSeq.set(cid, seq);
    return seq;
  }

  onIndexProgress(p: IndexProgress): void {
    this.indexing[p.collectionId] = p;
    if (p.done && this.view === 'search' && this.searchIndexing) void this.rerunSearch();
  }

  async onUnavailable(cid: string): Promise<void> {
    this.bumpTreeSeq(cid); // a refresh in flight must not bring the tree back
    delete this.trees[cid];
    delete this.indexing[cid];
    this.report({ code: 'CollectionUnavailable' }); // same plain message, and "Copy details" works
    try {
      this.collections = await this.api.listCollections();
    } catch (e) {
      this.report(e);
    }
  }

  /** Shows an error's plain message and keeps its details for "Copy details". */
  report(e: unknown): void {
    this.notice = describeError(e);
    this.lastError = isAppError(e) ? e : { code: 'Internal', details: String(e) };
  }

  dismissNotice(): void {
    this.notice = null;
    this.lastError = null;
  }

  async copyDetails(): Promise<void> {
    const e = this.lastError;
    if (!e) return;
    this.lastError = null;
    try {
      await navigator.clipboard.writeText(errorDetails(e));
      this.notice = 'Details copied.';
    } catch {
      this.notice = 'The details couldn’t be copied. They are also in the log file: Privacy & Help › Open log folder.';
    }
  }

  /** A website or email link in a document: ask first, unless the reader turned that off. */
  followExternal(url: string): void {
    if (this.library.prefs.extLinks === 'direct') void this.openExternal(url);
    else this.externalUrl = url;
  }

  async openExternal(url: string, dontAskAgain = false): Promise<void> {
    this.externalUrl = null;
    try {
      await this.api.openExternal(url);
      if (dontAskAgain) {
        this.setPref('extLinks', 'direct'); // only once the link was accepted: a refused link must not turn the question off
        this.notice = 'Websites will now open without asking. You can change this in Privacy & Help.';
      }
    } catch (e) {
      this.report(e);
    }
  }

  showBroken(target: string, collectionId: string): void {
    this.brokenLink = { target, collectionId };
  }

  /** "Search for similar pages": search the link's folder for the missing page's name. */
  searchSimilar(): void {
    const b = this.brokenLink;
    this.brokenLink = null;
    if (!b) return;
    this.activeCollection = b.collectionId;
    Object.assign(this.query, { scope: 'collection', folder: '' });
    this.searchFor(friendlyName(b.target));
  }

  /** "Review and show picture…": ask, or send the reader to the setting that blocks it. */
  reviewImage(url: string, alt: string): void {
    if (this.library.prefs.remoteImages === 'block') {
      this.view = 'help';
      return;
    }
    this.imageReview = { url, alt };
  }

  async showImage(always: boolean): Promise<void> {
    const r = this.imageReview;
    this.imageReview = null;
    if (!r) return;
    if (always) {
      allowSite(this.library, hostOf(r.url));
      this.persist();
    }
    this.failedImages.delete(r.url); // the reader asked: try again
    await this.loadRemoteImage(r.url);
  }

  private picturesBlocked(): boolean {
    return this.library.prefs.remoteImages === 'block';
  }

  /** Sites the reader always allows load by themselves, unless pictures from the internet are blocked. */
  isSiteAllowed(url: string): boolean {
    return this.library.prefs.remoteImages !== 'block' && this.library.allowedImageSites.includes(hostOf(url));
  }

  async loadRemoteImage(url: string): Promise<void> {
    if (this.picturesBlocked() || this.shownImages[url] || this.loadingImages.has(url) || this.failedImages.has(url)) return;
    this.loadingImages.add(url);
    const gen = this.imageGen;
    try {
      const img = dataUrl(await this.api.fetchRemoteImage(url));
      if (gen === this.imageGen && !this.picturesBlocked()) this.shownImages[url] = img; // blocked or reset meanwhile: never show
    } catch (e) {
      this.failedImages.add(url);
      this.report(e);
    } finally {
      this.loadingImages.delete(url);
    }
  }

  forbidSite(host: string): void {
    forbidSite(this.library, host);
    this.imageGen++; // a fetch for this site still in flight is dropped
    const h = host.trim().toLowerCase();
    for (const url of Object.keys(this.shownImages)) if (hostOf(url) === h) delete this.shownImages[url];
    this.persist();
  }

  clearHistory(): void {
    clearHistory(this.library);
    this.persist();
    this.notice = 'History cleared. Your documents are not affected.';
  }

  /** "Reset workspace" (amendment A9): back to a first start, keeping "Your folders". */
  resetWorkspace(): void {
    resetLibrary(this.library);
    this.applyPrefs();
    this.ws = W.emptyWorkspace();
    this.savedSession = null;
    this.sessionLive = true;
    this.find = [null, null];
    this.imageGen++;
    this.searchSeq++; // a search still in flight must not write results afterwards
    this.shownImages = {};
    this.failedImages.clear();
    this.results = null;
    this.resultsQuery = null;
    this.query.q = '';
    this.searchIndexing = false;
    this.imageReview = null;
    this.brokenLink = null;
    this.externalUrl = null;
    this.detailsKey = null;
    this.view = 'home';
    this.persist();
    this.notice = 'Markvy has been reset. Your folders and documents are not affected.';
  }

  /** Removes a folder from "Your folders"; its documents stay where they are. */
  async forgetCollection(id: string): Promise<void> {
    const name = this.collections.find((c) => c.id === id)?.name ?? '';
    try {
      await this.api.forgetCollection(id);
    } catch (e) {
      this.report(e);
      return;
    }
    this.bumpTreeSeq(id); // a refresh in flight must not bring the tree back
    W.closeCollection(this.ws, id);
    delete this.trees[id];
    delete this.indexing[id];
    this.failedTrees.delete(id);
    let listed = true;
    try {
      this.collections = await this.api.listCollections();
    } catch (e) {
      listed = false;
      this.collections = this.collections.filter((c) => c.id !== id); // the core already removed it
      this.report(e);
    }
    if (this.activeCollection === id) {
      const next = this.collections.find((c) => c.available)?.id ?? null;
      if (next) this.selectCollection(next);
      else this.activeCollection = null;
    }
    this.persist();
    if (listed) this.notice = `“${name}” was removed from your folders. The folder itself is unchanged.`;
  }

  fileAction = $state<FileAction | null>(null);
  /** The sidebar's open context menu: where it sits and the control to give focus back to. */
  fileMenu = $state<{ cid: string; path: string; isFolder: boolean; x: number; y: number; opener: HTMLElement | null } | null>(null);

  /** Page and folder actions are on only when editing is allowed, and never in the bundled sample. */
  canManageFiles(cid: string | null): boolean {
    return !!cid && cid !== 'sample' && this.library.prefs.allowEditing;
  }

  /** Every readable page with the text and fingerprint from one read; pages that can't be opened are listed in `skipped`. */
  async readAll(cid: string): Promise<{ docs: Map<string, { text: string; hash: string }>; skipped: string[] }> {
    const docs = new Map<string, { text: string; hash: string }>();
    const skipped: string[] = [];
    for (const p of this.filesFor(cid).filter((f) => /\.(md|markdown|txt)$/i.test(f))) {
      try { docs.set(p, await this.api.openForEdit(cid, p)); } catch { skipped.push(p); }
    }
    return { docs, skipped };
  }

  /** Keys at or under a path that have unsaved work (a session not clean, or a draft). */
  private unsavedUnder(cid: string, path: string): string[] {
    const base = docKey(cid, path);
    const hit = (k: string) => k === base || k.startsWith(base + '/');
    return [...new Set([...Object.keys(this.sessions), ...Object.keys(this.drafts)])]
      .filter((k) => hit(k) && (!!this.drafts[k] || this.sessions[k]?.state !== 'clean'));
  }

  private dropSessions(cid: string, path: string): void {
    const base = docKey(cid, path);
    for (const k of Object.keys(this.sessions)) if (k === base || k.startsWith(base + '/')) { this.sessions[k].dispose(); delete this.sessions[k]; }
    this.clearChangedNotice();
  }

  /** The "changed on disk" notice is about a page being edited: it goes when that editing ends. */
  private clearChangedNotice(): void {
    if (this.notice === MESSAGES.ChangedOnDisk) this.notice = null;
  }

  async createPage(cid: string, folder: string, title: string, name: string): Promise<void> {
    try {
      const path = await this.api.createPage(cid, folder, name, title);
      await this.refreshTree(cid);
      const key = docKey(cid, path);
      this.open(key);
      await this.startEditing(key);
    } catch (e) { this.report(e); }
  }

  async createFolder(cid: string, parent: string, name: string): Promise<void> {
    try { await this.api.createFolder(cid, parent, name); await this.refreshTree(cid); } catch (e) { this.report(e); }
  }

  async renameEntry(cid: string, path: string, newName: string): Promise<boolean> {
    const { docs } = await this.readAll(cid);
    const to = [...path.split('/').slice(0, -1), newName].join('/');
    const plan = planRename(new Map([...docs].map(([p, d]) => [p, d.text])), path, to);
    const mine = this.unsavedUnder(cid, path).map((k) => parseKey(k).path);
    const busy = [...mine, ...plan.map((p) => p.path).filter((p) => this.unsavedUnder(cid, p).length)][0];
    if (busy !== undefined) { this.notice = `Save or discard edits in ${friendlyName(busy)} first.`; return false; }
    try {
      const edits = plan.map((p) => ({ path: p.path, text: p.text, baseHash: docs.get(p.path)!.hash }));
      const newPath = await this.api.renameWithEdits(cid, path, newName, edits);
      this.dropSessions(cid, path); // all clean here; the tab now shows the new path
      await this.refreshTree(cid);
      this.retargetTabs(cid, path, newPath);
      return true;
    } catch (e) {
      this.notice = `Renaming stopped: ${describeError(e)} Nothing was changed.`;
      return false;
    }
  }

  async deleteEntry(cid: string, path: string): Promise<boolean> {
    const busy = this.unsavedUnder(cid, path)[0];
    if (busy !== undefined) { this.notice = `Save or discard edits in ${friendlyName(parseKey(busy).path)} first.`; return false; }
    try {
      this.dropSessions(cid, path); // before the page is gone, so nothing writes to it afterwards
      await this.api.deleteEntry(cid, path);
      const gone = docKey(cid, path);
      for (const k of Object.keys(this.drafts)) if (k === gone || k.startsWith(gone + '/')) delete this.drafts[k];
      await this.refreshTree(cid);
      return true;
    } catch (e) { this.report(e); return false; }
  }

  /** After a rename, points open tabs, history and the library lists at the new path. */
  retargetTabs(cid: string, from: string, to: string): void {
    const a = docKey(cid, from);
    const b = docKey(cid, to);
    const fix = (k: string) => (k === a || k.startsWith(a + '/') ? b + k.slice(a.length) : k);
    for (const pane of this.ws.panes) for (const tab of pane.tabs) for (const h of tab.history) h.key = fix(h.key);
    const lib = this.library;
    lib.favorites = lib.favorites.map(fix);
    for (const r of lib.recent) r.key = fix(r.key);
    for (const bm of lib.bookmarks) { bm.key = fix(bm.key); bm.id = `${bm.key}#${bm.slug}`; }
    lib.progress = Object.fromEntries(Object.entries(lib.progress).map(([k, v]) => [fix(k), v]));
    this.persist();
  }

  openLogFolder(): void {
    this.api.openLogFolder().catch((e) => this.report(e));
  }

  persist(): void {
    if (this.canSave) this.saver.schedule();
    else if (!this.ready) this.persistAfterInit = true; // e.g. a document opened from Home while start-up finishes
  }

  flush(): Promise<void> {
    return this.saver.flush();
  }

  /** Window hidden or closing: the library and every unsaved draft are written now, not after their delays. */
  async flushAll(): Promise<void> {
    // A save in progress skips the draft; wait for it so words typed meanwhile are written too.
    await Promise.all([this.flush(), ...Object.values(this.sessions).map(async (s) => { await s.settled(); await s.flushDraft(); })]);
  }

  private snapshotLibrary(): LibraryData {
    // Until the user opens or restores something, keep the session that was on disk.
    return { ...this.library, session: this.sessionLive ? W.toSession(this.ws, this.activeCollection) : this.library.session };
  }
}

export const app = new AppStore();
