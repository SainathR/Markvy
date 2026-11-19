import { describe, expect, it, vi } from 'vitest';
import { EditSession } from './edit.svelte';

const api = (over = {}) => ({
  saveDraft: vi.fn().mockResolvedValue(undefined),
  discardDraft: vi.fn().mockResolvedValue(undefined),
  saveDocument: vi.fn().mockResolvedValue({ status: 'saved', hash: 'h1' }),
  createPage: vi.fn().mockResolvedValue('Page (my copy).md'),
  ...over,
}) as any;

describe('EditSession', () => {
  it('saves a draft about a second after typing stops', async () => {
    vi.useFakeTimers();
    const a = api();
    const s = new EditSession(a, 'c1/Page.md', { text: 'old', hash: 'h0' }, null, () => 42);
    s.change('new 1'); s.change('new 2');
    await vi.advanceTimersByTimeAsync(1100);
    expect(a.saveDraft).toHaveBeenCalledTimes(1);
    expect(a.saveDraft).toHaveBeenCalledWith({ collectionId: 'c1', path: 'Page.md', baseHash: 'h0', text: 'new 2', savedAt: 42 });
    expect(s.state).toBe('dirty');
    vi.useRealTimers();
  });

  it('saves, becomes clean and remembers its own fingerprint', async () => {
    const a = api();
    const s = new EditSession(a, 'c1/Page.md', { text: 'old', hash: 'h0' });
    s.change('new');
    expect(await s.save()).toBe(true);
    expect(a.saveDocument).toHaveBeenCalledWith('c1', 'Page.md', 'new', 'h0');
    expect([s.state, s.baseHash, s.isOwnSave('h1'), s.isOwnSave('h9')]).toEqual(['clean', 'h1', true, false]);
  });

  it('a second save while saving waits for the first', async () => {
    let finish!: (v: unknown) => void;
    const a = api({ saveDocument: vi.fn().mockImplementationOnce(() => new Promise((r) => (finish = r))).mockResolvedValue({ status: 'saved', hash: 'h2' }) });
    const s = new EditSession(a, 'c1/Page.md', { text: 'old', hash: 'h0' });
    s.change('new');
    const first = s.save(); const second = s.save();
    finish({ status: 'saved', hash: 'h1' });
    await Promise.all([first, second]);
    expect(a.saveDocument).toHaveBeenCalledTimes(1);
    expect(s.state).toBe('clean');
  });

  it('offers Combine both when the edits are in different blocks', async () => {
    const a = api({ saveDocument: vi.fn().mockResolvedValueOnce({ status: 'conflict', text: 'A2\n\nB\n', hash: 'hT' }).mockResolvedValue({ status: 'saved', hash: 'h3' }) });
    const s = new EditSession(a, 'c1/P.md', { text: 'A\n\nB\n', hash: 'h0' });
    s.change('A\n\nB2\n');
    expect(await s.save()).toBe(false);
    expect(s.state).toBe('conflict');
    expect(s.conflict!.merged).toEqual({ kind: 'clean', text: 'A2\n\nB2\n' });
    expect(await s.resolve('combine')).toBe(true);
    expect(a.saveDocument).toHaveBeenLastCalledWith('c1', 'P.md', 'A2\n\nB2\n', 'hT');
  });

  it('keeps the draft when a save fails', async () => {
    const a = api({ saveDocument: vi.fn().mockRejectedValue({ code: 'FileInUse' }) });
    const s = new EditSession(a, 'c1/P.md', { text: 'x', hash: 'h0' });
    s.change('y');
    expect(await s.save()).toBe(false);
    expect([s.state, a.discardDraft.mock.calls.length]).toEqual(['error', 0]);
    expect(s.error).toMatch(/in use by another program/);
  });

  it('restores from a draft', () => {
    const s = new EditSession(api(), 'c1/P.md', { text: 'disk', hash: 'h0' }, { collectionId: 'c1', path: 'P.md', baseHash: 'h0', text: 'draft', savedAt: 1 });
    expect([s.text, s.state]).toEqual(['draft', 'dirty']);
  });

  it('save as a copy writes the edit to a new page and keeps the original', async () => {
    const a = api({
      saveDocument: vi.fn().mockResolvedValueOnce({ status: 'conflict', text: 'T\n', hash: 'hT' }).mockResolvedValue({ status: 'saved', hash: 'hc' }),
      createPage: vi.fn().mockResolvedValue('Guides/P (my copy).md'),
      openForEdit: vi.fn().mockResolvedValue({ text: '# P\n', hash: 'hn' }),
    });
    const s = new EditSession(a, 'c1/Guides/P.md', { text: 'O\n', hash: 'h0' });
    s.change('M\n');
    await s.save();
    expect(await s.resolve('copy', ['P.md'])).toBe(true);
    expect(a.createPage).toHaveBeenCalledWith('c1', 'Guides', 'P (my copy).md', 'P (my copy)');
    expect(a.saveDocument).toHaveBeenLastCalledWith('c1', 'Guides/P (my copy).md', 'M\n', 'hn');
  });

  it('a draft made against an older file never combines silently', async () => {
    const a = api({ saveDocument: vi.fn().mockResolvedValue({ status: 'conflict', text: 'disk now\n', hash: 'h5' }) });
    const s = new EditSession(a, 'c1/P.md', { text: 'disk now\n', hash: 'h5' }, { collectionId: 'c1', path: 'P.md', baseHash: 'h0', text: 'draft\n', savedAt: 1 });
    expect(s.baseHash).toBe('h0');
    await s.save();
    expect(a.saveDocument).toHaveBeenCalledWith('c1', 'P.md', 'draft\n', 'h0');
    expect(s.conflict!.merged).toEqual({ kind: 'clash', clashes: [{ mine: 'draft\n', theirs: 'disk now\n' }] });
  });

  it('a draft write in flight when saving starts lands first, then a fresh draft follows typing during the save', async () => {
    const order: string[] = [];
    let release!: () => void;
    const a = api({
      saveDraft: vi.fn().mockImplementationOnce(() => new Promise<void>((r) => (release = () => { order.push('draft'); r(); }))).mockResolvedValue(undefined),
      saveDocument: vi.fn().mockImplementation(async () => { order.push('save'); return { status: 'saved', hash: 'h1' }; }),
    });
    const s = new EditSession(a, 'c1/P.md', { text: 'old', hash: 'h0' });
    s.change('new');
    void s.flushDraft();
    const saved = s.save();
    s.change('newer'); // typed during the save
    await Promise.resolve();
    expect(order).toEqual([]);
    release();
    expect(await saved).toBe(true);
    expect(order).toEqual(['draft', 'save']);
    expect(a.saveDraft).toHaveBeenLastCalledWith(expect.objectContaining({ baseHash: 'h1', text: 'newer' }));
    expect(s.state).toBe('dirty');
  });

  it('a draft equal to the file starts a clean session with the file hash', () => {
    const a = api();
    const s = new EditSession(a, 'c1/P.md', { text: 'disk', hash: 'h7' }, { collectionId: 'c1', path: 'P.md', baseHash: 'h0', text: 'disk', savedAt: 1 });
    expect([s.state, s.baseHash, s.text]).toEqual(['clean', 'h7', 'disk']);
    expect(a.discardDraft).toHaveBeenCalledWith('c1', 'P.md');
  });

  it('combine uses the text as it is now, and refuses when it now clashes', async () => {
    const a = api({ saveDocument: vi.fn().mockResolvedValueOnce({ status: 'conflict', text: 'A2\n\nB\n\nC\n', hash: 'hT' }).mockResolvedValue({ status: 'saved', hash: 'h3' }) });
    const s = new EditSession(a, 'c1/P.md', { text: 'A\n\nB\n\nC\n', hash: 'h0' });
    s.change('A\n\nB2\n\nC\n');
    await s.save();
    s.change('A\n\nB2\n\nC2\n'); // typed after the conflict appeared
    expect(await s.resolve('combine')).toBe(true);
    expect(a.saveDocument).toHaveBeenLastCalledWith('c1', 'P.md', 'A2\n\nB2\n\nC2\n', 'hT');

    const b = api({ saveDocument: vi.fn().mockResolvedValue({ status: 'conflict', text: 'A2\n\nB\n', hash: 'hT' }) });
    const t = new EditSession(b, 'c1/P.md', { text: 'A\n\nB\n', hash: 'h0' });
    t.change('A\n\nB2\n');
    await t.save();
    t.change('A3\n\nB2\n');
    expect(await t.resolve('combine')).toBe(false);
    expect(t.conflict!.merged.kind).toBe('clash');
    expect(b.saveDocument).toHaveBeenCalledTimes(1);
  });

  it('save as a copy keeps text typed while the copy was being made', async () => {
    let finish!: (v: unknown) => void;
    const a = api({
      saveDocument: vi.fn().mockResolvedValueOnce({ status: 'conflict', text: 'T\n', hash: 'hT' }).mockResolvedValue({ status: 'saved', hash: 'hc' }),
      createPage: vi.fn().mockImplementation(() => new Promise((r) => (finish = r))),
      openForEdit: vi.fn().mockResolvedValue({ text: '# P\n', hash: 'hn' }),
    });
    const s = new EditSession(a, 'c1/P.md', { text: 'O\n', hash: 'h0' });
    s.change('M\n');
    await s.save();
    const done = s.resolve('copy', []);
    s.change('M more\n');
    finish('P (my copy).md');
    expect(await done).toBe(true);
    expect(a.saveDocument).toHaveBeenLastCalledWith('c1', 'P (my copy).md', 'M\n', 'hn');
    expect([s.text, s.state, s.baseHash]).toEqual(['M more\n', 'dirty', 'hT']);
  });

  it('a conflict choice is one write: save() and settled() during it start nothing new', async () => {
    let finish!: (v: unknown) => void;
    const a = api({
      saveDocument: vi.fn().mockResolvedValueOnce({ status: 'conflict', text: 'T\n', hash: 'hT' }).mockImplementationOnce(() => new Promise((r) => (finish = r))),
    });
    const s = new EditSession(a, 'c1/P.md', { text: 'O\n', hash: 'h0' });
    s.change('M\n');
    await s.save();
    const choice = s.resolve('mine');
    const again = s.save(); // e.g. a Save click while the choice is being written
    let settled = false;
    void s.settled().then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    finish({ status: 'saved', hash: 'hM' });
    expect(await choice).toBe(true);
    expect(await again).toBe(true);
    await s.settled();
    expect(a.saveDocument).toHaveBeenCalledTimes(2);
    expect([s.state, s.isOwnSave('hM')]).toEqual(['clean', true]);
  });
});
