import { describe, expect, it, vi, type Mock } from 'vitest';
import { assetUrl, core, describeError, errorDetails, filesOf, isAppError, MESSAGES, NAME_MESSAGES, type TreeNode } from './core';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue({ results: [], indexing: false }) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));

describe('assetUrl', () => {
  it('encodes spaces, accents and # per path segment', () => {
    expect(assetUrl('abc', 'My Notes/Café #1.png', false)).toBe('markvy://localhost/abc/My%20Notes/Caf%C3%A9%20%231.png');
  });

  it('uses the Windows form of custom protocols', () => {
    expect(assetUrl('abc', 'Images/a.svg', true)).toBe('http://markvy.localhost/abc/Images/a.svg');
  });
});

describe('describeError', () => {
  it('turns codes into the spec wording', () => {
    expect(describeError({ code: 'TooLarge' })).toBe('This file is too large to display.');
    expect(describeError({ code: 'CollectionUnavailable' })).toBe('This folder can’t be reached. It may be on a drive that isn’t connected.');
    expect(describeError({ code: 'LinkRefused' })).toBe(MESSAGES.LinkRefused);
    expect(MESSAGES.ImageRejected).toBe('That link isn’t a picture, or it’s larger than 5 MB.');
  });

  it('never shows error details', () => {
    const text = describeError({ code: 'Internal', details: '/secret/path' });
    expect(text).toBe(MESSAGES.Internal);
    expect(text).not.toContain('/secret');
  });

  it('accepts only real error codes', () => {
    expect(describeError({ code: 'constructor' })).toBe(MESSAGES.Internal);
    expect(describeError({ code: 'LibraryReset' })).toBe(MESSAGES.Internal);
  });

  it('never shows raw error text', () => {
    expect(describeError(new Error('ENOENT: /secret/path'))).toBe('Something went wrong. Please try again.');
  });
});

describe('filesOf', () => {
  it('lists every file path in a tree', () => {
    const tree: TreeNode = { name: '', path: '', kind: 'folder', children: [
      { name: 'README.md', path: 'README.md', kind: 'document', children: [] },
      { name: 'Images', path: 'Images', kind: 'folder', children: [{ name: 'a.svg', path: 'Images/a.svg', kind: 'image', children: [] }] },
    ] };
    expect(filesOf(tree)).toEqual(['README.md', 'Images/a.svg']);
  });
});

describe('core search and events', () => {
  it('sends the query, scope and filters under the names the core expects', async () => {
    const scope = { kind: 'collection', collectionId: 'c1' } as const;
    const filters = { headingsOnly: false, wholeWords: true, folder: 'Guides' };
    await core.search('wifi', scope, filters);
    expect(invoke).toHaveBeenCalledWith('search', { query: 'wifi', scope, filters });
  });

  it('hands event payloads to the listener', async () => {
    const cb = vi.fn();
    await core.onCollectionUnavailable(cb);
    const [name, handler] = (listen as Mock).mock.calls.at(-1)!;
    expect(name).toBe('collection-unavailable');
    handler({ payload: { collectionId: 'c1' } });
    expect(cb).toHaveBeenCalledWith('c1');
  });
});

describe('error details', () => {
  it('recognises core errors', () => {
    expect(isAppError({ code: 'NotFound' })).toBe(true);
    expect(isAppError({ code: 'Nope' })).toBe(false);
    expect(isAppError(new Error('x'))).toBe(false);
  });

  it('puts the version, time and code (with details) on one line for the clipboard', () => {
    const at = new Date('2026-11-03T10:00:00.000Z');
    expect(errorDetails({ code: 'Internal', details: 'disk unreadable' }, at)).toBe(`Markvy ${__APP_VERSION__} · 2026-11-03T10:00:00.000Z · Internal: disk unreadable`);
    expect(errorDetails({ code: 'NotFound' }, at)).toMatch(/· NotFound$/);
  });
});

describe('core commands added in Plan 4', () => {
  it('sends the argument names the core expects', async () => {
    await core.fetchRemoteImage('https://example.org/a.png');
    expect(invoke).toHaveBeenCalledWith('fetch_remote_image', { url: 'https://example.org/a.png' });
    await core.openExternal('https://example.org');
    expect(invoke).toHaveBeenCalledWith('open_external', { url: 'https://example.org' });
    await core.forgetCollection('c1');
    expect(invoke).toHaveBeenCalledWith('forget_collection', { collectionId: 'c1' });
    await core.openLogFolder();
    expect(invoke).toHaveBeenCalledWith('open_log_folder');
  });
});

describe('core recovery command (A12)', () => {
  it('takeRecovery calls take_recovery with no arguments', async () => {
    await core.takeRecovery();
    expect(invoke).toHaveBeenCalledWith('take_recovery');
  });
});

describe('edit errors', () => {
  it('has a plain message for every edit code', () => {
    for (const code of ['FileInUse', 'DiskFull', 'NotEditable', 'NameRefused', 'NoRecycleBin', 'Changed'] as const) {
      expect(describeError({ code })).toBe(MESSAGES[code]);
    }
  });
  it('explains each refused name', () => {
    expect(describeError({ code: 'NameRefused', details: 'Taken' })).toBe(NAME_MESSAGES.Taken);
  });
});
