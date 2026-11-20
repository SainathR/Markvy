import { describe, expect, it, vi } from 'vitest';
import type { Collection, Tree } from '../lib/core';
import type { SaveResult, SearchResult } from '../lib/core';
import { MESSAGES } from '../lib/core';
import { DEFAULT_PREFS } from '../lib/prefs';
import { AppStore, type CoreApi } from './app.svelte';

const sample: Collection = { id: 'sample', name: 'Sample library', root: '/res/sample-wiki', available: true };
const tree: Tree = { truncated: false, root: { name: '', path: '', kind: 'folder', children: [
  { name: 'README.md', path: 'README.md', kind: 'document', children: [] },
  { name: 'Guide.md', path: 'Guide.md', kind: 'document', children: [] },
] } };

function fakeApi(over: Partial<CoreApi> = {}): CoreApi {
  return {
    listCollections: vi.fn().mockResolvedValue([sample]),
    pickFolder: vi.fn().mockResolvedValue(null),
    pickFile: vi.fn().mockResolvedValue(null),
    getTree: vi.fn().mockResolvedValue(tree),
    readDocument: vi.fn().mockResolvedValue({ text: '# Hi', size: 4, modifiedMs: null, lossy: false }),
    loadLibrary: vi.fn().mockResolvedValue({ library: { version: 1 }, reset: false }),
    saveLibrary: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue({ results: [], indexing: false }),
    onCollectionChanged: vi.fn().mockResolvedValue(() => {}),
    onIndexProgress: vi.fn().mockResolvedValue(() => {}),
    onCollectionUnavailable: vi.fn().mockResolvedValue(() => {}),
    onCloseRequested: vi.fn().mockResolvedValue(() => {}),
    closeReady: vi.fn().mockResolvedValue(undefined),
    fetchRemoteImage: vi.fn().mockResolvedValue({ mime: 'image/png', base64: 'AA==' }),
    openExternal: vi.fn().mockResolvedValue(undefined),
    openLogFolder: vi.fn().mockResolvedValue(undefined),
    forgetCollection: vi.fn().mockResolvedValue(undefined),
    takeRecovery: vi.fn().mockResolvedValue(null),
    setEditingAllowed: vi.fn().mockResolvedValue(undefined),
    openForEdit: vi.fn().mockResolvedValue({ text: '# Hi', hash: 'h0' }),
    fileFingerprint: vi.fn().mockResolvedValue('h0'),
    saveDocument: vi.fn().mockResolvedValue({ status: 'saved', hash: 'h1' }),
    saveDraft: vi.fn().mockResolvedValue(undefined),
    discardDraft: vi.fn().mockResolvedValue(undefined),
    deleteEntry: vi.fn().mockResolvedValue(undefined),
    takeDraft: vi.fn().mockResolvedValue(null),
    listDrafts: vi.fn().mockResolvedValue([]),
    createPage: vi.fn().mockResolvedValue('New.md'),
    createFolder: vi.fn().mockResolvedValue('New'),
    renameWithEdits: vi.fn().mockResolvedValue('New.md'),
    savePicture: vi.fn().mockResolvedValue('images/x-1.png'),
    ...over,
  } as CoreApi;
}

describe('AppStore', () => {
  it('opens the contents panel at start only where it does not lie over the document (wider than 1080 px)', () => {
    for (const [narrow, open] of [[true, false], [false, true]] as const) {
      vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(max-width: 1080px)' && narrow }));
      expect(new AppStore(fakeApi()).tocOpen).toBe(open);
    }
    vi.unstubAllGlobals();
  });

  it('init keeps folders and refuses saves when the library cannot be read', async () => {
    const api = fakeApi({ loadLibrary: vi.fn().mockRejectedValue({ code: 'AccessDenied' }) });
    const app = new AppStore(api);
    await app.init();
    expect(app.collections).toEqual([sample]);
    expect(app.notice).toBe(MESSAGES.AccessDenied);
    app.toggleFavorite('sample/README.md');
    await app.flush();
    expect(api.saveLibrary).not.toHaveBeenCalled();
  });

  it('reports a library that was reset', async () => {
    const app = new AppStore(fakeApi({ loadLibrary: vi.fn().mockResolvedValue({ library: { version: 1 }, reset: true }) }));
    await app.init();
    expect(app.notice).toBe(MESSAGES.LibraryReset);
  });

  it('opening a document records it as recent and saves', async () => {
    const api = fakeApi();
    const app = new AppStore(api);
    await app.init();
    app.open('sample/Guide.md');
    await app.flush();
    expect(app.view).toBe('reader');
    expect(app.currentKey).toBe('sample/Guide.md');
    const saved = (api.saveLibrary as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(saved.recent[0].key).toBe('sample/Guide.md');
    expect(saved.session.panes[0].tabs[0].key).toBe('sample/Guide.md');
  });

  it('restoreSession skips unknown collections', async () => {
    const session = { split: false, ratio: 0.5, activeCollection: 'sample', at: 1, panes: [
      { tabs: [{ key: 'gone/a.md', scroll: 0 }, { key: 'sample/README.md', scroll: 30 }], active: 0 }, { tabs: [], active: 0 },
    ] };
    const app = new AppStore(fakeApi({ loadLibrary: vi.fn().mockResolvedValue({ library: { version: 1, session }, reset: false }) }));
    await app.init();
    expect(app.savedSession).not.toBeNull();
    app.restoreSession();
    expect(app.ws.panes[0].tabs).toHaveLength(1);
    expect(app.currentKey).toBe('sample/README.md');
    expect(app.ws.panes[0].tabs[0].history[0].scroll).toBe(30);
  });

  it('caches documents so switching tabs does not re-read them', async () => {
    const api = fakeApi();
    const app = new AppStore(api);
    await app.loadDocument('sample/README.md');
    await app.loadDocument('sample/README.md');
    expect(api.readDocument).toHaveBeenCalledTimes(1);
  });

  it('openFile opens the chosen document inside its folder', async () => {
    const folder: Collection = { id: 'f1', name: 'Notes', root: '/n', available: true };
    const api = fakeApi({
      pickFile: vi.fn().mockResolvedValue({ collection: folder, path: 'todo.md' }),
      listCollections: vi.fn().mockResolvedValueOnce([sample]).mockResolvedValueOnce([sample, folder]),
    });
    const app = new AppStore(api);
    await app.init();
    await app.openFile();
    expect(app.collections).toEqual([sample, folder]);
    expect(app.currentKey).toBe('f1/todo.md');
  });

  it('keeps the saved session on disk until the user opens or restores one', async () => {
    const session = { split: false, ratio: 0.5, activeCollection: 'sample', at: 1, panes: [
      { tabs: [{ key: 'sample/README.md', scroll: 30 }], active: 0 }, { tabs: [], active: 0 },
    ] };
    const api = fakeApi({ loadLibrary: vi.fn().mockResolvedValue({ library: { version: 1, session }, reset: false }) });
    const app = new AppStore(api);
    await app.init();
    app.setPref('fontSize', 20);
    await app.flush();
    const saved = (api.saveLibrary as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(saved.prefs.fontSize).toBe(20);
    expect(saved.session).toEqual(session);
  });

  it('restore opens the first document when no saved tab survives', async () => {
    const session = { split: false, ratio: 0.5, activeCollection: 'gone', at: 1, panes: [
      { tabs: [{ key: 'gone/a.md', scroll: 0 }], active: 0 }, { tabs: [], active: 0 },
    ] };
    const app = new AppStore(fakeApi({ loadLibrary: vi.fn().mockResolvedValue({ library: { version: 1, session }, reset: false }) }));
    await app.init();
    app.restoreSession();
    await vi.waitFor(() => expect(app.currentKey).toBe('sample/README.md'));
    expect(app.ws.panes[0].tabs).toHaveLength(1);
    expect(app.view).toBe('reader');
  });

  it('loads each tree once while the first load is in flight', async () => {
    const api = fakeApi();
    const app = new AppStore(api);
    const [a, b] = await Promise.all([app.ensureTree('sample'), app.ensureTree('sample')]);
    expect(api.getTree).toHaveBeenCalledTimes(1);
    expect(a).toEqual(tree);
    expect(b).toEqual(tree);
  });

  it('retries a tree load that failed', async () => {
    const api = fakeApi({ getTree: vi.fn().mockRejectedValueOnce({ code: 'NotFound' }).mockResolvedValue(tree) });
    const app = new AppStore(api);
    expect(await app.ensureTree('sample')).toBeNull();
    expect(app.notice).toBe(MESSAGES.NotFound);
    expect(await app.ensureTree('sample')).toEqual(tree);
    expect(api.getTree).toHaveBeenCalledTimes(2);
  });

  it('marks a folder whose load failed and clears the mark on a successful retry', async () => {
    const api = fakeApi({ getTree: vi.fn().mockRejectedValueOnce({ code: 'NotFound' }).mockResolvedValue(tree) });
    const app = new AppStore(api);
    await app.ensureTree('sample');
    expect(app.failedTrees.has('sample')).toBe(true);
    await app.ensureTree('sample');
    expect(app.failedTrees.has('sample')).toBe(false);
  });

  it('open re-reads the document from disk', async () => {
    const api = fakeApi();
    const app = new AppStore(api);
    await app.loadDocument('sample/Guide.md');
    app.open('sample/Guide.md');
    await app.loadDocument('sample/Guide.md');
    expect(api.readDocument).toHaveBeenCalledTimes(2);
  });

  it('closing the last tab that shows a document drops its cache', async () => {
    const api = fakeApi();
    const app = new AppStore(api);
    app.open('sample/Guide.md');
    await app.loadDocument('sample/Guide.md');
    app.closeTab(0, app.ws.panes[0].activeId as number);
    await app.loadDocument('sample/Guide.md');
    expect(api.readDocument).toHaveBeenCalledTimes(2);
  });

  it('closing a tab keeps the cache while another tab still shows the document', async () => {
    const api = fakeApi();
    const app = new AppStore(api);
    app.open('sample/Guide.md');
    app.openBeside('sample/Guide.md');
    await app.loadDocument('sample/Guide.md');
    app.closeTab(0, app.ws.panes[0].activeId as number);
    await app.loadDocument('sample/Guide.md');
    expect(api.readDocument).toHaveBeenCalledTimes(1);
  });

  it('saves nothing before the library has loaded', async () => {
    const api = fakeApi();
    const app = new AppStore(api);
    app.toggleFavorite('sample/README.md');
    await app.flush();
    expect(api.saveLibrary).not.toHaveBeenCalled();
  });

  it('saves nothing until init has finished', async () => {
    let release!: (v: Tree) => void;
    const api = fakeApi({ getTree: vi.fn().mockReturnValue(new Promise<Tree>((r) => (release = r))) });
    const app = new AppStore(api);
    const starting = app.init();
    await vi.waitFor(() => expect(api.getTree).toHaveBeenCalled());
    expect(app.ready).toBe(false);
    app.startFresh();
    await app.flush();
    expect(api.saveLibrary).not.toHaveBeenCalled();
    release(tree);
    await starting;
    expect(app.ready).toBe(true);
    app.toggleFavorite('sample/README.md');
    await app.flush();
    expect(api.saveLibrary).toHaveBeenCalledTimes(1);
  });

  it('saves a document opened during start-up once init finishes', async () => {
    let release!: (v: Tree) => void;
    const api = fakeApi({ getTree: vi.fn().mockReturnValue(new Promise<Tree>((r) => (release = r))) });
    const app = new AppStore(api);
    const starting = app.init();
    await vi.waitFor(() => expect(api.getTree).toHaveBeenCalled());
    app.open('sample/Guide.md');
    release(tree);
    await starting;
    await app.flush();
    const saved = (api.saveLibrary as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(saved.recent[0].key).toBe('sample/Guide.md');
    expect(app.activeCollection).toBe('sample');
  });

  it('gives filesFor the folder tree when it arrives after the document', async () => {
    let release!: (v: Tree) => void;
    const api = fakeApi({ getTree: vi.fn().mockReturnValue(new Promise<Tree>((r) => (release = r))) });
    const app = new AppStore(api);
    const both = Promise.all([app.loadDocument('sample/README.md'), app.ensureTree('sample')]);
    await vi.waitFor(() => expect(api.readDocument).toHaveBeenCalled());
    expect(app.filesFor('sample')).toEqual([]);
    release(tree);
    await both;
    expect(app.filesFor('sample')).toEqual(['README.md', 'Guide.md']);
  });

  it('splitting puts the other document of the folder beside the active one', async () => {
    const app = new AppStore(fakeApi());
    await app.init();
    app.open('sample/README.md');
    app.setSplit(true);
    expect(app.ws.split).toBe(true);
    expect(app.ws.panes[1].tabs[0].history[0].key).toBe('sample/Guide.md');
  });

  it('merging the split moves the right pane tabs back to the left', async () => {
    const app = new AppStore(fakeApi());
    await app.init();
    app.open('sample/README.md');
    app.setSplit(true);
    app.setSplit(false);
    expect(app.ws.split).toBe(false);
    expect(app.ws.panes[0].tabs.map((t) => t.history[0].key)).toEqual(['sample/README.md', 'sample/Guide.md']);
  });

  const result = (path: string): SearchResult => ({ collectionId: 'sample', path, title: path, titleMatch: false, total: 1, hits: [] });

  it('searchFor runs the search, remembers it and shows the Search screen', async () => {
    const api = fakeApi({ search: vi.fn().mockResolvedValue({ results: [result('Guide.md')], indexing: true }) });
    const app = new AppStore(api);
    await app.init();
    app.searchFor('wifi');
    await vi.waitFor(() => expect(app.results).toHaveLength(1));
    expect(app.view).toBe('search');
    expect(app.searchIndexing).toBe(true);
    expect(app.library.searches[0].q).toBe('wifi');
    expect(api.search).toHaveBeenCalledWith('wifi', { kind: 'all' }, { headingsOnly: false, wholeWords: false, folder: '' });
  });

  it('keeps the query the results came from when the box changes', async () => {
    const api = fakeApi({ search: vi.fn().mockResolvedValue({ results: [result('Guide.md')], indexing: false }) });
    const app = new AppStore(api);
    await app.init();
    app.searchFor('wifi');
    await vi.waitFor(() => expect(app.results).toHaveLength(1));
    app.query.q = 'other';
    expect(app.resultsQuery).toEqual({ q: 'wifi', wholeWords: false });
  });

  it('sends the folder filter only when searching one folder', async () => {
    const api = fakeApi();
    const app = new AppStore(api);
    await app.init();
    Object.assign(app.query, { scope: 'collection', folder: 'Guides' });
    app.searchFor('x');
    await vi.waitFor(() =>
      expect(api.search).toHaveBeenCalledWith('x', { kind: 'collection', collectionId: 'sample' }, { headingsOnly: false, wholeWords: false, folder: 'Guides' }));
  });

  it('searches everywhere when "this document" has no document open', () => {
    const app = new AppStore(fakeApi());
    expect(app.scopeFor('document')).toEqual({ kind: 'all' });
    app.open('sample/Guide.md');
    expect(app.scopeFor('document')).toEqual({ kind: 'document', collectionId: 'sample', path: 'Guide.md' });
  });

  it('ignores a search answer that arrives after a newer search', async () => {
    let first!: (v: unknown) => void;
    const search = vi.fn()
      .mockReturnValueOnce(new Promise((r) => (first = r)))
      .mockResolvedValueOnce({ results: [result('new.md')], indexing: false });
    const app = new AppStore(fakeApi({ search }));
    app.query.q = 'old';
    const older = app.runSearch();
    app.query.q = 'new';
    await app.runSearch();
    first({ results: [result('old.md')], indexing: false });
    await older;
    expect(app.results?.map((r) => r.path)).toEqual(['new.md']);
  });

  it('opening a result highlights the query in the pane it opens in', async () => {
    const app = new AppStore(fakeApi());
    await app.init();
    Object.assign(app.query, { q: 'guest', wholeWords: true });
    app.openResult('sample/Guide.md', 'wi-fi');
    expect(app.find[0]).toEqual({ key: 'sample/Guide.md', q: 'guest', wholeWords: true, slug: 'wi-fi' });
    expect(app.currentKey).toBe('sample/Guide.md');
    expect(app.library.searches[0].q).toBe('guest');
  });

  it('a new search result is not yet applied, even after an earlier one was', async () => {
    const app = new AppStore(fakeApi());
    await app.init();
    app.query.q = 'guest';
    app.openResult('sample/Guide.md', 'wi-fi');
    expect(app.find[0]?.applied).toBeUndefined();
    app.find[0]!.applied = true; // the reader scrolled to the first match
    app.openResult('sample/Guide.md', 'setup');
    expect(app.find[0]?.applied).toBeUndefined();
    expect(app.find[0]?.slug).toBe('setup');
  });

  it('bookmarks the section being read, and removes it again', async () => {
    const app = new AppStore(fakeApi());
    await app.init();
    app.open('sample/Guide.md');
    app.headings[0] = [{ slug: 'setup', text: 'Setup', level: 2, top: 0 }];
    app.currentSlugs[0] = 'setup';
    app.toggleBookmark(0);
    expect(app.library.bookmarks[0]).toMatchObject({ key: 'sample/Guide.md', slug: 'setup', heading: 'Setup' });
    expect(app.isBookmarked(0)).toBe(true);
    expect(app.notice).toBe('Bookmarked “Setup”');
    app.toggleBookmark(0);
    expect(app.library.bookmarks).toEqual([]);
    expect(app.notice).toBe('Bookmark removed: “Setup”');
  });

  it('a change on disk reloads the tree and the changed document', async () => {
    const api = fakeApi();
    const app = new AppStore(api);
    await app.init();
    app.open('sample/Guide.md');
    await app.loadDocument('sample/Guide.md');
    app.applyChange({ collectionId: 'sample', changes: [{ path: 'Guide.md', kind: 'modified' }] });
    expect(app.versions['sample/Guide.md']).toBe(1);
    await app.loadDocument('sample/Guide.md');
    expect(api.readDocument).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => expect(api.getTree).toHaveBeenCalledTimes(2));
  });

  it('a folder that goes away is reported and the folder list refreshed', async () => {
    const api = fakeApi({ listCollections: vi.fn().mockResolvedValueOnce([sample]).mockResolvedValueOnce([{ ...sample, available: false }]) });
    const app = new AppStore(api);
    await app.init();
    await app.onUnavailable('sample');
    expect(app.notice).toBe(MESSAGES.CollectionUnavailable);
    expect(app.lastError).toEqual({ code: 'CollectionUnavailable' });
    expect(app.collections[0].available).toBe(false);
    expect(app.trees.sample).toBeUndefined();
  });

  it('listens for core events from the start', async () => {
    const api = fakeApi();
    await new AppStore(api).init();
    expect(api.onCollectionChanged).toHaveBeenCalled();
    expect(api.onIndexProgress).toHaveBeenCalled();
    expect(api.onCollectionUnavailable).toHaveBeenCalled();
  });

  it('searches again when indexing finishes', async () => {
    const api = fakeApi({ search: vi.fn().mockResolvedValue({ results: [], indexing: true }) });
    const app = new AppStore(api);
    await app.init();
    app.searchFor('x');
    await vi.waitFor(() => expect(app.searchIndexing).toBe(true));
    app.onIndexProgress({ collectionId: 'sample', indexed: 2, total: 2, done: true });
    await vi.waitFor(() => expect(api.search).toHaveBeenCalledTimes(2));
  });

  it('a file change re-runs the submitted search, not the text typed since', async () => {
    const api = fakeApi({ search: vi.fn().mockResolvedValue({ results: [result('a.md')], indexing: false }) });
    const app = new AppStore(api);
    await app.init();
    app.searchFor('guest');
    await vi.waitFor(() => expect(app.results).not.toBeNull());
    app.query.q = 'half typed';
    app.applyChange({ collectionId: 'sample', changes: [{ path: 'Guide.md', kind: 'modified' }] });
    await vi.waitFor(() => expect(api.search).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.search).mock.calls[1][0]).toBe('guest');
    expect(app.resultsQuery?.q).toBe('guest');
  });

  it('opening a result takes whole-words from the submitted search; suggestions never do', async () => {
    const api = fakeApi({ search: vi.fn().mockResolvedValue({ results: [result('a.md')], indexing: false }) });
    const app = new AppStore(api);
    await app.init();
    app.query.wholeWords = true;
    app.searchFor('guest');
    await vi.waitFor(() => expect(app.resultsQuery).toEqual({ q: 'guest', wholeWords: true }));
    Object.assign(app.query, { q: 'other', wholeWords: false }); // edited since
    app.openResult('sample/Guide.md', 'wi-fi');
    expect(app.find[0]).toMatchObject({ q: 'guest', wholeWords: true });
    app.openResult('sample/Guide.md', 'setup', 'wifi');
    expect(app.find[0]).toMatchObject({ q: 'wifi', wholeWords: false });
  });

  it('a change with no search run yet does not search', async () => {
    const api = fakeApi();
    const app = new AppStore(api);
    await app.init();
    await app.rerunSearch();
    expect(api.search).not.toHaveBeenCalled();
  });

  it('a change during the first tree load still refetches the tree', async () => {
    let first!: (t: Tree) => void;
    const newer: Tree = { truncated: false, root: { ...tree.root, children: [] } };
    const getTree = vi.fn().mockReturnValueOnce(new Promise((r) => (first = r))).mockResolvedValueOnce(newer);
    const app = new AppStore(fakeApi({ getTree }));
    const loading = app.ensureTree('sample');
    app.applyChange({ collectionId: 'sample', changes: [] });
    first(tree);
    await loading;
    await vi.waitFor(() => expect(app.trees.sample).toEqual(newer));
    expect(getTree).toHaveBeenCalledTimes(2);
  });

  it('overlapping tree refreshes: the newer tree wins even if the older answers last', async () => {
    let older!: (t: Tree) => void;
    const newer: Tree = { truncated: false, root: { ...tree.root, children: [] } };
    const getTree = vi.fn().mockResolvedValueOnce(tree).mockReturnValueOnce(new Promise((r) => (older = r))).mockResolvedValueOnce(newer);
    const app = new AppStore(fakeApi({ getTree }));
    await app.ensureTree('sample');
    const a = app.refreshTree('sample');
    await vi.waitFor(() => expect(getTree).toHaveBeenCalledTimes(2));
    await app.refreshTree('sample');
    older(tree);
    await a;
    expect(app.trees.sample).toEqual(newer);
  });

  it('a tree refresh in flight when the folder goes away does not bring the tree back', async () => {
    let late!: (t: Tree) => void;
    const getTree = vi.fn().mockResolvedValueOnce(tree).mockReturnValueOnce(new Promise((r) => (late = r)));
    const app = new AppStore(fakeApi({ getTree }));
    await app.ensureTree('sample');
    const refresh = app.refreshTree('sample');
    await vi.waitFor(() => expect(getTree).toHaveBeenCalledTimes(2));
    await app.onUnavailable('sample');
    late(tree);
    await refresh;
    expect(app.trees.sample).toBeUndefined();
  });

  it('an empty change list reloads every open document of that folder', async () => {
    const api = fakeApi();
    const app = new AppStore(api);
    await app.init();
    app.open('sample/Guide.md');
    await app.loadDocument('sample/Guide.md');
    app.applyChange({ collectionId: 'other', changes: [] });
    expect(app.versions['sample/Guide.md']).toBeUndefined();
    app.applyChange({ collectionId: 'sample', changes: [] });
    expect(app.versions['sample/Guide.md']).toBe(1);
    await app.loadDocument('sample/Guide.md');
    expect(api.readDocument).toHaveBeenCalledTimes(2);
  });

  it('asks before opening a website, unless the reader turned that off', async () => {
    const api = fakeApi();
    const app = new AppStore(api);
    await app.init();
    app.followExternal('https://example.org');
    expect(app.externalUrl).toBe('https://example.org');
    expect(api.openExternal).not.toHaveBeenCalled();
    await app.openExternal('https://example.org', true);
    expect(app.externalUrl).toBeNull();
    expect(app.library.prefs.extLinks).toBe('direct');
    app.followExternal('https://example.net');
    await vi.waitFor(() => expect(api.openExternal).toHaveBeenCalledWith('https://example.net'));
  });

  it('reports a refused link with its message and keeps the details for copying', async () => {
    const app = new AppStore(fakeApi({ openExternal: vi.fn().mockRejectedValue({ code: 'LinkRefused' }) }));
    await app.openExternal('ftp://x');
    expect(app.notice).toBe(MESSAGES.LinkRefused);
    expect(app.lastError).toEqual({ code: 'LinkRefused' });
    app.dismissNotice();
    expect([app.notice, app.lastError]).toEqual([null, null]);
  });

  it('copies error details to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    try {
      const app = new AppStore(fakeApi());
      app.report({ code: 'Internal', details: 'disk unreadable' });
      await app.copyDetails();
      expect(writeText.mock.calls[0][0]).toMatch(/Internal: disk unreadable$/);
      expect(app.notice).toBe('Details copied.');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('shows a picture once, or always for its site', async () => {
    const api = fakeApi();
    const app = new AppStore(api);
    await app.init();
    app.reviewImage('https://images.example.org/a.jpg', 'Room');
    await app.showImage(false);
    expect(app.shownImages['https://images.example.org/a.jpg']).toBe('data:image/png;base64,AA==');
    expect(app.isSiteAllowed('https://images.example.org/b.jpg')).toBe(false);
    app.reviewImage('https://images.example.org/b.jpg', '');
    await app.showImage(true);
    expect(app.library.allowedImageSites).toEqual(['images.example.org']);
    expect(app.isSiteAllowed('https://images.example.org/c.jpg')).toBe(true);
    await app.loadRemoteImage('https://images.example.org/b.jpg');
    expect(api.fetchRemoteImage).toHaveBeenCalledTimes(2);
  });

  it('blocked pictures send the reader to Privacy & Help instead of asking', async () => {
    const app = new AppStore(fakeApi());
    await app.init();
    app.library.allowedImageSites = ['x.org'];
    app.setPref('remoteImages', 'block');
    app.reviewImage('https://x.org/a.png', '');
    expect(app.imageReview).toBeNull();
    expect(app.view).toBe('help');
    expect(app.isSiteAllowed('https://x.org/a.png')).toBe(false);
  });

  it('a failed picture keeps its placeholder and says why', async () => {
    const app = new AppStore(fakeApi({ fetchRemoteImage: vi.fn().mockRejectedValue({ code: 'ImageRejected' }) }));
    await app.loadRemoteImage('https://x.org/a.png');
    expect(app.shownImages).toEqual({});
    expect(app.notice).toBe(MESSAGES.ImageRejected);
  });

  it('a picture that failed is not retried on its own, only when the reader asks', async () => {
    const fetch = vi.fn().mockRejectedValueOnce({ code: 'ImageFailed' }).mockResolvedValue({ mime: 'image/png', base64: 'AA==' });
    const app = new AppStore(fakeApi({ fetchRemoteImage: fetch }));
    await app.init();
    const url = 'https://x.org/a.png';
    await app.loadRemoteImage(url);
    await app.loadRemoteImage(url); // e.g. the document is shown again
    expect(fetch).toHaveBeenCalledTimes(1);
    app.reviewImage(url, '');
    await app.showImage(false);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(app.shownImages[url]).toBe('data:image/png;base64,AA==');
  });

  it('blocking pictures or resetting forgets which pictures failed', async () => {
    const fetch = vi.fn().mockRejectedValueOnce({ code: 'ImageFailed' }).mockRejectedValueOnce({ code: 'ImageFailed' }).mockResolvedValue({ mime: 'image/png', base64: 'AA==' });
    const app = new AppStore(fakeApi({ fetchRemoteImage: fetch }));
    await app.init();
    await app.loadRemoteImage('https://x.org/a.png');
    app.setPref('remoteImages', 'block');
    app.setPref('remoteImages', 'ask');
    await app.loadRemoteImage('https://x.org/a.png');
    expect(fetch).toHaveBeenCalledTimes(2);
    app.resetWorkspace();
    await app.loadRemoteImage('https://x.org/a.png');
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('a fetch for a site removed meanwhile is dropped', async () => {
    let release!: (v: { mime: string; base64: string }) => void;
    const slow = new Promise<{ mime: string; base64: string }>((r) => (release = r));
    const app = new AppStore(fakeApi({ fetchRemoteImage: vi.fn().mockReturnValue(slow) }));
    await app.init();
    const loading = app.loadRemoteImage('https://x.org/a.png');
    app.forbidSite('x.org');
    release({ mime: 'image/png', base64: 'AA==' });
    await loading;
    expect(app.shownImages).toEqual({});
  });

  it('a search still running when the workspace is reset writes nothing', async () => {
    let release!: (v: { results: never[]; indexing: boolean }) => void;
    const slow = new Promise<{ results: never[]; indexing: boolean }>((r) => (release = r));
    const app = new AppStore(fakeApi({ search: vi.fn().mockReturnValue(slow) }));
    await app.init();
    const running = app.runSearch('guide');
    app.resetWorkspace();
    release({ results: [], indexing: true });
    await running;
    expect(app.results).toBeNull();
    expect(app.resultsQuery).toBeNull();
    expect(app.searchIndexing).toBe(false);
  });

  it('a broken link offers a search for similar pages in its folder', async () => {
    const api = fakeApi();
    const app = new AppStore(api);
    await app.init();
    app.showBroken('Guides/Printer-Manual.md', 'sample');
    app.searchSimilar();
    expect(app.brokenLink).toBeNull();
    expect(app.view).toBe('search');
    await vi.waitFor(() => expect(api.search).toHaveBeenCalledWith('Printer Manual', { kind: 'collection', collectionId: 'sample' }, expect.anything()));
  });

  it('clear history keeps favorites and settings', async () => {
    const app = new AppStore(fakeApi());
    await app.init();
    app.open('sample/Guide.md');
    app.toggleFavorite('sample/Guide.md');
    app.clearHistory();
    expect(app.library.recent).toEqual([]);
    expect(app.library.favorites).toEqual(['sample/Guide.md']);
  });

  it('reset returns to Home with defaults and keeps the folders', async () => {
    const session = { split: false, ratio: 0.5, activeCollection: 'sample', at: 1, panes: [{ tabs: [{ key: 'sample/Guide.md', scroll: 0 }], active: 0 }, { tabs: [], active: 0 }] };
    const api = fakeApi({ loadLibrary: vi.fn().mockResolvedValue({ library: { version: 1, session, prefs: { fontSize: 22 } }, reset: false }) });
    const app = new AppStore(api);
    await app.init();
    app.open('sample/Guide.md');
    app.toggleFavorite('sample/Guide.md');
    app.library.allowedImageSites = ['x.org'];
    app.query.q = 'old';
    await app.runSearch();
    app.find[0] = { key: 'sample/Guide.md', q: 'old', wholeWords: false, slug: null };
    app.imageReview = { url: 'https://x.org/a.png', alt: '' };
    app.brokenLink = { target: 'a.md', collectionId: 'sample' };
    app.externalUrl = 'https://example.org';
    app.detailsKey = 'sample/Guide.md';
    app.resetWorkspace();
    expect(app.results).toBeNull();
    expect(app.resultsQuery).toBeNull();
    expect(app.query.q).toBe('');
    expect([app.imageReview, app.brokenLink, app.externalUrl, app.detailsKey]).toEqual([null, null, null, null]);
    expect(app.library.favorites).toEqual([]);
    expect(app.library.allowedImageSites).toEqual([]);
    expect(app.find).toEqual([null, null]);
    expect(app.view).toBe('home');
    expect(app.savedSession).toBeNull();
    expect(app.ws.panes[0].tabs).toEqual([]);
    expect(app.library.prefs).toEqual(DEFAULT_PREFS);
    expect(app.collections).toEqual([sample]);
    await app.flush();
    const saved = (api.saveLibrary as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    expect(saved.recent).toEqual([]);
  });

  it('restoring default reading settings keeps the privacy choices', async () => {
    const app = new AppStore(fakeApi());
    await app.init();
    app.setPref('extLinks', 'direct');
    app.setPref('fontSize', 22);
    app.resetPrefs();
    expect(app.library.prefs.fontSize).toBe(DEFAULT_PREFS.fontSize);
    expect(app.library.prefs.extLinks).toBe('direct');
  });

  it('forgetting a folder closes its tabs and picks another folder', async () => {
    const other: Collection = { id: 'f1', name: 'Notes', root: '/n', available: true };
    const api = fakeApi({ listCollections: vi.fn().mockResolvedValueOnce([sample, other]).mockResolvedValueOnce([sample]) });
    const app = new AppStore(api);
    await app.init();
    app.open('f1/todo.md');
    app.open('sample/Guide.md');
    app.activeCollection = 'f1';
    await app.forgetCollection('f1');
    expect(api.forgetCollection).toHaveBeenCalledWith('f1');
    expect(app.ws.panes[0].tabs.map((t) => t.history[t.index].key)).toEqual(['sample/Guide.md']);
    expect(app.activeCollection).toBe('sample');
    expect(app.collections).toEqual([sample]);
    expect(app.notice).toBe('“Notes” was removed from your folders. The folder itself is unchanged.');
  });

  it('forgetting the active folder loads the tree of the folder that replaces it', async () => {
    const f1: Collection = { id: 'f1', name: 'One', root: '/1', available: true };
    const f2: Collection = { id: 'f2', name: 'Two', root: '/2', available: true };
    const api = fakeApi({ listCollections: vi.fn().mockResolvedValueOnce([f1, f2]).mockResolvedValueOnce([f2]) });
    const app = new AppStore(api);
    await app.init();
    expect(app.activeCollection).toBe('f1');
    await app.forgetCollection('f1');
    expect(app.activeCollection).toBe('f2');
    expect(api.getTree).toHaveBeenCalledWith('f2');
  });

  it('forgetting a folder still removes it when the folder list cannot be refreshed', async () => {
    const other: Collection = { id: 'f1', name: 'Notes', root: '/n', available: true };
    const api = fakeApi({ listCollections: vi.fn().mockResolvedValueOnce([other, sample]).mockRejectedValueOnce({ code: 'Internal' }) });
    const app = new AppStore(api);
    await app.init();
    app.open('f1/todo.md');
    await app.forgetCollection('f1');
    expect(app.collections).toEqual([sample]);
    expect(app.activeCollection).toBe('sample');
    expect(app.ws.panes[0].tabs).toEqual([]);
    expect(app.notice).toBe(MESSAGES.Internal);
  });

  it('forgetting a folder stops an in-flight tree refresh from bringing its tree back', async () => {
    let release!: (t: Tree) => void;
    const slow = new Promise<Tree>((r) => (release = r));
    const other: Collection = { id: 'f1', name: 'Notes', root: '/n', available: true };
    const getTree = vi.fn().mockResolvedValueOnce(tree).mockResolvedValueOnce(tree).mockReturnValueOnce(slow);
    const api = fakeApi({ getTree, listCollections: vi.fn().mockResolvedValueOnce([sample, other]).mockResolvedValueOnce([sample]) });
    const app = new AppStore(api);
    await app.init();
    await app.ensureTree('f1');
    const refresh = app.refreshTree('f1');
    await vi.waitFor(() => expect(getTree).toHaveBeenCalledTimes(3));
    await app.forgetCollection('f1');
    release(tree);
    await refresh;
    expect(app.trees['f1']).toBeUndefined();
  });

  it('a picture still loading when pictures are blocked is never shown', async () => {
    let release!: (v: { mime: string; base64: string }) => void;
    const slow = new Promise<{ mime: string; base64: string }>((r) => (release = r));
    const api = fakeApi({ fetchRemoteImage: vi.fn().mockReturnValue(slow) });
    const app = new AppStore(api);
    await app.init();
    const loading = app.loadRemoteImage('https://x.org/a.png');
    app.setPref('remoteImages', 'block');
    release({ mime: 'image/png', base64: 'AA==' });
    await loading;
    expect(app.shownImages).toEqual({});
    await app.loadRemoteImage('https://x.org/b.png');
    expect(api.fetchRemoteImage).toHaveBeenCalledTimes(1);
  });

  it('a picture still loading when the workspace is reset is never shown', async () => {
    let release!: (v: { mime: string; base64: string }) => void;
    const slow = new Promise<{ mime: string; base64: string }>((r) => (release = r));
    const app = new AppStore(fakeApi({ fetchRemoteImage: vi.fn().mockReturnValue(slow) }));
    await app.init();
    const loading = app.loadRemoteImage('https://x.org/a.png');
    app.resetWorkspace();
    release({ mime: 'image/png', base64: 'AA==' });
    await loading;
    expect(app.shownImages).toEqual({});
  });

  it('removing a site also hides its pictures already shown', async () => {
    const app = new AppStore(fakeApi());
    await app.init();
    app.reviewImage('https://images.example.org/a.jpg', '');
    await app.showImage(true);
    await app.loadRemoteImage('https://other.org/b.jpg');
    app.forbidSite('images.example.org');
    expect(app.library.allowedImageSites).toEqual([]);
    expect(Object.keys(app.shownImages)).toEqual(['https://other.org/b.jpg']);
  });

  it('a refused link does not turn the website question off', async () => {
    const app = new AppStore(fakeApi({ openExternal: vi.fn().mockRejectedValue({ code: 'LinkRefused' }) }));
    await app.init();
    await app.openExternal('ftp://x', true);
    expect(app.library.prefs.extLinks).toBe('ask');
    expect(app.notice).toBe(MESSAGES.LinkRefused);
  });
});

describe('AppStore crash recovery (A12)', () => {
  const savedSession = { split: false, ratio: 0.5, activeCollection: 'sample', at: 1, panes: [
    { tabs: [{ key: 'gone/a.md', scroll: 0 }, { key: 'sample/README.md', scroll: 30 }], active: 0 }, { tabs: [], active: 0 },
  ] };
  const library = (session: unknown) => ({ library: { version: 1, session }, reset: false });

  it('after a crash reload, the saved tabs come back with a notice', async () => {
    const app = new AppStore(fakeApi({
      loadLibrary: vi.fn().mockResolvedValue(library(savedSession)),
      takeRecovery: vi.fn().mockResolvedValue({ restoreSession: true, startedAtMs: 0 }),
    }));
    await app.init();
    expect(app.view).toBe('reader');
    expect(app.notice).toBe(MESSAGES.RecoveredRestored);
  });

  it('after a repeated crash, tabs stay closed and Home offers restore', async () => {
    const app = new AppStore(fakeApi({
      loadLibrary: vi.fn().mockResolvedValue(library(savedSession)),
      takeRecovery: vi.fn().mockResolvedValue({ restoreSession: false, startedAtMs: 0 }),
    }));
    await app.init();
    expect(app.view).toBe('home');
    expect(app.savedSession).toBeTruthy();
    expect(app.notice).toBe(MESSAGES.RecoveredFresh);
  });

  it('a session saved before this run started is not restored by a crash', async () => {
    const app = new AppStore(fakeApi({
      loadLibrary: vi.fn().mockResolvedValue(library(savedSession)), // at: 1
      takeRecovery: vi.fn().mockResolvedValue({ restoreSession: true, startedAtMs: 1000 }),
    }));
    await app.init();
    expect(app.view).toBe('home');
    expect(app.notice).toBe(MESSAGES.Recovered);
  });

  it('when no saved tab survives, the notice does not claim the tabs are back', async () => {
    const gone = { ...savedSession, at: 5000, panes: [{ tabs: [{ key: 'gone/a.md', scroll: 0 }], active: 0 }, { tabs: [], active: 0 }] };
    const app = new AppStore(fakeApi({
      loadLibrary: vi.fn().mockResolvedValue(library(gone)),
      takeRecovery: vi.fn().mockResolvedValue({ restoreSession: true, startedAtMs: 1000 }),
    }));
    await app.init();
    expect(app.notice).toBe(MESSAGES.Recovered);
  });

  it('a crash before anything was saved says only that Markvy reloaded', async () => {
    const app = new AppStore(fakeApi({ takeRecovery: vi.fn().mockResolvedValue({ restoreSession: true, startedAtMs: 0 }) }));
    await app.init();
    expect(app.notice).toBe(MESSAGES.Recovered);
  });

  it('a normal start shows no recovery notice', async () => {
    const app = new AppStore(fakeApi());
    await app.init();
    expect(app.notice).toBeNull();
  });

  it('a failing recovery check never blocks start-up', async () => {
    const app = new AppStore(fakeApi({ takeRecovery: vi.fn().mockRejectedValue({ code: 'Internal' }) }));
    await app.init();
    expect(app.ready).toBe(true);
    expect(app.notice).toBeNull();
  });

  describe('editing sessions', () => {
    const key = 'sample/A.md';
    it('keeps the session when text typed during a save cannot be backed up', async () => {
      const api = fakeApi({ saveDraft: vi.fn().mockRejectedValue(new Error('x')) });
      const app = new AppStore(api);
      await app.startEditing(key);
      const s = app.sessions[key];
      s.change('a');
      const stopping = app.stopEditing(key, 'save');
      s.change('b'); // typed while saving
      expect(await stopping).toBe(false);
      expect(app.sessions[key]).toBe(s);
      expect(app.notice).toBe(MESSAGES.DraftsFailing);
    });

    it('no "changed on disk" notice when the session is dropped while the check is pending', async () => {
      let release!: (h: string) => void;
      const api = fakeApi({ fileFingerprint: vi.fn().mockReturnValue(new Promise<string>((r) => { release = r; })) });
      const app = new AppStore(api);
      await app.startEditing(key);
      app.applyChange({ collectionId: 'sample', changes: [{ path: 'A.md', kind: 'modified' }] });
      await vi.waitFor(() => expect(api.fileFingerprint).toHaveBeenCalled());
      app.sessions[key].dispose(); // what a rename or delete does
      delete app.sessions[key];
      release('other');
      await new Promise((r) => setTimeout(r, 0));
      expect(app.notice).toBeNull();
    });

    it('no "changed on disk" notice for the version the conflict dialog already shows', async () => {
      const api = fakeApi({
        saveDocument: vi.fn().mockResolvedValue({ status: 'conflict', hash: 'H2', text: '# Theirs' }),
        fileFingerprint: vi.fn().mockResolvedValue('H2'),
      });
      const app = new AppStore(api);
      await app.startEditing(key);
      app.sessions[key].change('# Mine');
      expect(await app.sessions[key].save()).toBe(false);
      app.applyChange({ collectionId: 'sample', changes: [{ path: 'A.md', kind: 'modified' }] });
      await vi.waitFor(() => expect(api.fileFingerprint).toHaveBeenCalled());
      await new Promise((r) => setTimeout(r, 0));
      expect(app.notice).toBeNull();
    });

    it('leaving edit mode clears the "changed on disk" notice', async () => {
      const app = new AppStore(fakeApi());
      await app.startEditing(key);
      app.notice = MESSAGES.ChangedOnDisk;
      expect(await app.stopEditing(key, 'keep')).toBe(true);
      expect(app.notice).toBeNull();
    });

    it('deleting an edited page clears the "changed on disk" notice', async () => {
      const app = new AppStore(fakeApi());
      await app.startEditing(key);
      app.notice = MESSAGES.ChangedOnDisk;
      expect(await app.deleteEntry('sample', 'A.md')).toBe(true);
      expect(app.notice).toBeNull();
    });

    it('turning off Allow editing keeps every draft before the core refuses writes', async () => {
      const order: string[] = [];
      const api = fakeApi({
        saveDraft: vi.fn(async () => { order.push('draft'); }),
        setEditingAllowed: vi.fn(async (v: boolean) => { order.push(`allowed:${v}`); }),
      });
      const app = new AppStore(api);
      await app.startEditing(key);
      app.sessions[key].change('typed');
      expect(await app.setAllowEditing(false)).toBe(true);
      expect(order).toEqual(['draft', 'allowed:false']);
      expect(app.sessions).toEqual({});
      expect(app.drafts[key]?.text).toBe('typed');
      expect(app.library.prefs.allowEditing).toBe(false);
    });

    it('turning off Allow editing stays on when a draft cannot be kept', async () => {
      const api = fakeApi({ saveDraft: vi.fn().mockRejectedValue(new Error('x')) });
      const app = new AppStore(api);
      await app.startEditing(key);
      app.sessions[key].change('typed');
      expect(await app.setAllowEditing(false)).toBe(false);
      expect(app.library.prefs.allowEditing).toBe(true);
      expect(api.setEditingAllowed).not.toHaveBeenCalledWith(false);
      expect(app.notice).toBe(MESSAGES.DraftsFailing);
    });

    it('closing the window writes every draft at once, then lets the window close', async () => {
      let onClose!: () => void;
      const order: string[] = [];
      const api = fakeApi({
        onCloseRequested: vi.fn(async (cb: () => void) => { onClose = cb; return () => {}; }),
        saveDraft: vi.fn(async (d: { path: string }) => { order.push(`draft:${d.path}`); }),
        closeReady: vi.fn(async () => { order.push('close'); }),
      });
      const app = new AppStore(api);
      await app.init();
      await app.startEditing('c1/A.md');
      await app.startEditing('c1/B.md');
      app.sessions['c1/A.md'].change('typed a'); // within the 1 s draft delay
      app.sessions['c1/B.md'].change('typed b');
      onClose();
      await vi.waitFor(() => expect(api.closeReady).toHaveBeenCalled());
      expect(order).toEqual(['draft:A.md', 'draft:B.md', 'close']);
    });

    it('hiding the window writes every draft at once', async () => {
      const api = fakeApi();
      const app = new AppStore(api);
      await app.startEditing('c1/A.md');
      app.sessions['c1/A.md'].change('typed');
      await app.flushAll();
      expect(api.saveDraft).toHaveBeenCalledWith(expect.objectContaining({ path: 'A.md', text: 'typed' }));
    });

    it('writing every draft waits for a save in progress, so words typed during it are kept', async () => {
      let finishSave!: () => void;
      const api = fakeApi({ saveDocument: vi.fn(() => new Promise<SaveResult>((ok) => { finishSave = () => ok({ status: 'saved', hash: 'h1' }); })) });
      const app = new AppStore(api);
      await app.startEditing('c1/A.md');
      const s = app.sessions['c1/A.md'];
      s.change('typed');
      const saving = s.save();
      await vi.waitFor(() => expect(api.saveDocument).toHaveBeenCalled());
      s.change('typed more'); // during the save
      let flushed = false;
      const all = app.flushAll().then(() => { flushed = true; });
      await new Promise((r) => setTimeout(r, 0));
      expect(flushed).toBe(false); // still waiting for the save
      finishSave();
      await all;
      await saving;
      expect(api.saveDraft).toHaveBeenCalledWith(expect.objectContaining({ path: 'A.md', text: 'typed more' }));
    });

    it('keep with a failing draft write keeps the session; a working one ends it', async () => {
      const api = fakeApi({ saveDraft: vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue(undefined) });
      const app = new AppStore(api);
      await app.startEditing(key);
      app.sessions[key].change('a');
      expect(await app.stopEditing(key, 'keep')).toBe(false);
      expect(app.sessions[key]).toBeDefined();
      expect(await app.stopEditing(key, 'keep')).toBe(true);
      expect(app.sessions[key]).toBeUndefined();
      expect(app.drafts[key]?.text).toBe('a'); // the reader offers it back at once
    });

    it('resetPrefs tells the core the editing choice', () => {
      const api = fakeApi();
      const app = new AppStore(api);
      app.resetPrefs();
      expect(api.setEditingAllowed).toHaveBeenCalledWith(true);
    });
  });
});

describe('file actions', () => {
  it('rename sends the planned link edits with their fingerprints and waits for drafts', async () => {
    const api = fakeApi({
      openForEdit: vi.fn(async (_c: string, p: string) => ({ text: p === 'Guide.md' ? 'See [[README]].\n' : '# R\n', hash: `h:${p}` })),
    });
    const s = new AppStore(api);
    await s.init();
    s.trees['c1'] = tree;
    expect(await s.renameEntry('c1', 'README.md', 'Start.md')).toBe(true);
    expect(api.renameWithEdits).toHaveBeenCalledWith('c1', 'README.md', 'Start.md', [{ path: 'Guide.md', text: 'See [[Start]].\n', baseHash: 'h:Guide.md' }]);
    s.drafts['c1/Guide.md'] = { collectionId: 'c1', path: 'Guide.md', baseHash: 'x', text: 'y', savedAt: 1 };
    expect(await s.renameEntry('c1', 'README.md', 'Other.md')).toBe(false);
    expect(s.notice).toMatch(/Save or discard edits in Guide/);
  });

  it('rename moves open tabs and library entries to the new path', async () => {
    const s = new AppStore(fakeApi({ renameWithEdits: vi.fn().mockResolvedValue('Start.md') }));
    await s.init();
    s.trees['c1'] = tree;
    s.open('c1/README.md');
    s.library.favorites = ['c1/README.md'];
    expect(await s.renameEntry('c1', 'README.md', 'Start.md')).toBe(true);
    expect(s.currentKey).toBe('c1/Start.md');
    expect(s.library.favorites).toEqual(['c1/Start.md']);
  });

  it('new page opens it in edit mode', async () => {
    const api = fakeApi({ createPage: vi.fn().mockResolvedValue('Payment-Rules.md') });
    const s = new AppStore(api);
    await s.init();
    await s.createPage('c1', '', 'Payment Rules', 'Payment-Rules.md');
    expect(api.createPage).toHaveBeenCalledWith('c1', '', 'Payment-Rules.md', 'Payment Rules');
    expect(api.openForEdit).toHaveBeenCalledWith('c1', 'Payment-Rules.md');
  });

  const folderTree: Tree = { truncated: false, root: { name: '', path: '', kind: 'folder', children: [
    { name: 'docs', path: 'docs', kind: 'folder', children: [{ name: 'A.md', path: 'docs/A.md', kind: 'document', children: [] }] },
  ] } };
  const draft = { collectionId: 'c1', path: 'docs/A.md', baseHash: 'x', text: 'y', savedAt: 1 };

  it('rename is refused while the renamed page has a dirty session', async () => {
    const api = fakeApi();
    const s = new AppStore(api);
    await s.init();
    s.trees['c1'] = tree;
    s.sessions['c1/README.md'] = { state: 'dirty', dispose: vi.fn() } as never;
    expect(await s.renameEntry('c1', 'README.md', 'Start.md')).toBe(false);
    expect(api.renameWithEdits).not.toHaveBeenCalled();
    expect(s.notice).toMatch(/Save or discard edits in README/);
  });

  it('renaming a folder is refused when a page inside has a draft', async () => {
    const api = fakeApi();
    const s = new AppStore(api);
    await s.init();
    s.trees['c1'] = folderTree;
    s.drafts['c1/docs/A.md'] = draft;
    expect(await s.renameEntry('c1', 'docs', 'notes')).toBe(false);
    expect(api.renameWithEdits).not.toHaveBeenCalled();
  });

  it('a successful rename disposes the clean session under the old key', async () => {
    const dispose = vi.fn();
    const s = new AppStore(fakeApi({ renameWithEdits: vi.fn().mockResolvedValue('Start.md') }));
    await s.init();
    s.trees['c1'] = tree;
    s.sessions['c1/README.md'] = { state: 'clean', dispose } as never;
    expect(await s.renameEntry('c1', 'README.md', 'Start.md')).toBe(true);
    expect(dispose).toHaveBeenCalled();
    expect(s.sessions['c1/README.md']).toBeUndefined();
  });

  it('delete is refused with unsaved work and calls nothing', async () => {
    const api = fakeApi();
    const s = new AppStore(api);
    await s.init();
    s.trees['c1'] = folderTree;
    s.sessions['c1/docs/A.md'] = { state: 'dirty', dispose: vi.fn() } as never;
    expect(await s.deleteEntry('c1', 'docs')).toBe(false);
    expect(api.deleteEntry).not.toHaveBeenCalled();
    expect(s.notice).toMatch(/Save or discard edits in A first/);
  });

  it('delete disposes clean sessions before the API call and leaves no drafts', async () => {
    const order: string[] = [];
    const api = fakeApi({ deleteEntry: vi.fn(async () => { order.push('api'); }) });
    const s = new AppStore(api);
    await s.init();
    s.trees['c1'] = folderTree;
    s.sessions['c1/docs/A.md'] = { state: 'clean', dispose: () => order.push('dispose') } as never;
    expect(await s.deleteEntry('c1', 'docs')).toBe(true);
    expect(order).toEqual(['dispose', 'api']);
    expect(Object.keys(s.drafts).filter((k) => k.startsWith('c1/docs'))).toEqual([]);
  });
});
