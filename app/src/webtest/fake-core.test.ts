import { describe, expect, it } from 'vitest';
import { handle } from './fake-core';

describe('simulated core for screen tests', () => {
  it('lists the sample library', () => {
    expect(handle('list_collections', {})).toEqual([{ id: 'sample', name: 'Sample library', root: '/sample-wiki', available: true }]);
  });

  it('builds the tree from the sample wiki in the real core order: files first, then folders, each by name', () => {
    const tree = handle('get_tree', { collectionId: 'sample' }) as any;
    expect(tree.truncated).toBe(false);
    expect(tree.root.children.map((c: any) => c.name)).toEqual(['Getting-Started.md', 'README.md', 'Guides', 'Images', 'References', 'Technical']);
  });

  it('reads a document', () => {
    const doc = handle('read_document', { collectionId: 'sample', path: 'Guides/Introduction.md' }) as any;
    expect(doc.text).toContain('# Introduction to Digital Services');
  });

  it('refuses a missing document the way the core does', () => {
    expect(() => handle('read_document', { collectionId: 'sample', path: 'Nope.md' })).toThrow(expect.objectContaining({ code: 'NotFound' }));
  });

  it('finds sections by text', () => {
    const res = handle('search', { query: 'printing', scope: { kind: 'all' }, filters: { headingsOnly: false, wholeWords: false, folder: '' } }) as any;
    expect(res.indexing).toBe(false);
    expect(res.results.some((r: any) => r.path === 'Guides/Introduction.md' && r.hits.length > 0)).toBe(true);
  });

  it('saves and loads the library in session storage', () => {
    handle('save_library', { library: { version: 1, prefs: { theme: 'sepia' } } });
    expect((handle('load_library', {}) as any).library.prefs.theme).toBe('sepia');
  });
});
