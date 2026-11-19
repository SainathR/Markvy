import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export type ErrorCode = 'NotFound' | 'CollectionUnavailable' | 'AccessDenied' | 'OutsideCollection' | 'TooLarge' | 'NotText' | 'Internal'
  | 'ImageFailed' | 'ImageRejected' | 'LinkRefused' | 'FileInUse' | 'DiskFull' | 'NotEditable' | 'NameRefused' | 'NoRecycleBin' | 'Changed';
export interface AppError { code: ErrorCode; details?: string }
export interface Collection { id: string; name: string; root: string; available: boolean }
export interface TreeNode { name: string; path: string; kind: 'folder' | 'document' | 'image'; children: TreeNode[] }
export interface Tree { root: TreeNode; truncated: boolean }
export interface DocumentText { text: string; size: number; modifiedMs: number | null; lossy: boolean }
export interface LoadResult { library: Record<string, unknown>; reset: boolean }
export interface OpenedFile { collection: Collection; path: string }
export interface SearchHit { slug: string; heading: string; level: number; snippet: string; headingMatch: boolean }
export interface SearchResult { collectionId: string; path: string; title: string; titleMatch: boolean; total: number; hits: SearchHit[] }
export interface SearchResponse { results: SearchResult[]; indexing: boolean }
export type SearchScope =
  | { kind: 'all' }
  | { kind: 'collection'; collectionId: string }
  | { kind: 'document'; collectionId: string; path: string };
export interface SearchFilters { headingsOnly: boolean; wholeWords: boolean; folder: string }
export interface IndexProgress { collectionId: string; indexed: number; total: number; done: boolean }
export interface Change { path: string; kind: 'created' | 'modified' | 'removed' }
export interface CollectionChanged { collectionId: string; changes: Change[] }
export interface RemoteImage { mime: string; base64: string }
export interface Recovered { restoreSession: boolean; startedAtMs: number }

export interface EditSource { text: string; hash: string }
export type SaveResult = { status: 'saved'; hash: string } | { status: 'conflict'; text: string; hash: string };
export interface Draft { collectionId: string; path: string; baseHash: string; text: string; savedAt: number }
export interface FileEdit { path: string; text: string; baseHash: string }

export const core = {
  listCollections: () => invoke<Collection[]>('list_collections'),
  pickFolder: () => invoke<Collection | null>('pick_folder'),
  pickFile: () => invoke<OpenedFile | null>('pick_file'),
  getTree: (collectionId: string) => invoke<Tree>('get_tree', { collectionId }),
  readDocument: (collectionId: string, path: string) => invoke<DocumentText>('read_document', { collectionId, path }),
  loadLibrary: () => invoke<LoadResult>('load_library'),
  saveLibrary: (library: Record<string, unknown>) => invoke<void>('save_library', { library }),
  search: (query: string, scope: SearchScope, filters: SearchFilters) => invoke<SearchResponse>('search', { query, scope, filters }),
  fetchRemoteImage: (url: string) => invoke<RemoteImage>('fetch_remote_image', { url }),
  openExternal: (url: string) => invoke<void>('open_external', { url }),
  openLogFolder: () => invoke<void>('open_log_folder'),
  forgetCollection: (collectionId: string) => invoke<void>('forget_collection', { collectionId }),
  takeRecovery: () => invoke<Recovered | null>('take_recovery'),
  setEditingAllowed: (allowed: boolean) => invoke<void>('set_editing_allowed', { allowed }),
  openForEdit: (collectionId: string, path: string) => invoke<EditSource>('open_for_edit', { collectionId, path }),
  fileFingerprint: (collectionId: string, path: string) => invoke<string>('file_fingerprint', { collectionId, path }),
  saveDocument: (collectionId: string, path: string, text: string, baseHash: string) => invoke<SaveResult>('save_document', { collectionId, path, text, baseHash }),
  saveDraft: (draft: Draft) => invoke<void>('save_draft', { draft }),
  takeDraft: (collectionId: string, path: string) => invoke<Draft | null>('take_draft', { collectionId, path }),
  discardDraft: (collectionId: string, path: string) => invoke<void>('discard_draft', { collectionId, path }),
  listDrafts: () => invoke<Draft[]>('list_drafts'),
  createPage: (collectionId: string, folder: string, name: string, title: string) => invoke<string>('create_page', { collectionId, folder, name, title }),
  createFolder: (collectionId: string, parent: string, name: string) => invoke<string>('create_folder', { collectionId, parent, name }),
  renameWithEdits: (collectionId: string, from: string, newName: string, edits: FileEdit[]) => invoke<string>('rename_with_edits', { collectionId, from, newName, edits }),
  deleteEntry: (collectionId: string, path: string) => invoke<void>('delete_entry', { collectionId, path }),
  savePicture: (collectionId: string, page: string, base64: string) => invoke<string>('save_picture', { collectionId, page, base64 }),
  onIndexProgress: (cb: (p: IndexProgress) => void) => listen<IndexProgress>('index-progress', (e) => cb(e.payload)),
  onCollectionChanged: (cb: (c: CollectionChanged) => void) => listen<CollectionChanged>('collection-changed', (e) => cb(e.payload)),
  onCollectionUnavailable: (cb: (collectionId: string) => void) =>
    listen<{ collectionId: string }>('collection-unavailable', (e) => cb(e.payload.collectionId)),
  /** The window's close button: the core waits (briefly) for `closeReady` before closing. */
  onCloseRequested: (cb: () => void) => listen('close-requested', () => cb()),
  closeReady: () => invoke<void>('close_ready'),
};

const isWindows = () => typeof navigator !== 'undefined' && navigator.userAgent.includes('Windows');

export function assetUrl(collectionId: string, path: string, windows = isWindows()): string {
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  return windows ? `http://markvy.localhost/${collectionId}/${encoded}` : `markvy://localhost/${collectionId}/${encoded}`;
}

export function filesOf(node: TreeNode): string[] {
  return node.children.flatMap((c) => (c.kind === 'folder' ? filesOf(c) : [c.path]));
}

/** Spec §5 wording, verbatim. */
export const MESSAGES = {
  NotFound: 'This document was moved or deleted.',
  CollectionUnavailable: 'This folder can’t be reached. It may be on a drive that isn’t connected.',
  AccessDenied: 'Markvy isn’t allowed to read this file.',
  OutsideCollection: 'This link points outside the folder you opened, so Markvy won’t open it.',
  TooLarge: 'This file is too large to display.',
  NotText: 'This file isn’t a text document.',
  Internal: 'Something went wrong. Please try again.',
  ImageFailed: 'The picture couldn’t be loaded.',
  ImageRejected: 'That link isn’t a picture, or it’s larger than 5 MB.',
  LinkRefused: 'Markvy only opens web and email links.',
  TreeTruncated: 'Only the first 20,000 files are shown.',
  LibraryReset: 'Your saved settings couldn’t be read, so Markvy started fresh. A copy was kept.',
  Recovered: 'Markvy had a problem and reloaded.',
  RecoveredRestored: 'Markvy had a problem and reloaded. Your tabs are back.',
  RecoveredFresh: 'Markvy had a problem again and reloaded. Your tabs weren’t reopened, in case one of them caused it. You can reopen them with Restore previous session.',
  FileInUse: 'This file is in use by another program. Close it and press Save again.',
  DiskFull: 'There isn’t enough disk space to save.',
  NotEditable: 'This document can’t be edited here.',
  NameRefused: 'Markvy can’t use that name.',
  NoRecycleBin: 'This folder has no Recycle Bin, so Markvy will not delete it. Delete it in File Explorer if you are sure.',
  Changed: 'A page changed while Markvy was getting ready. Nothing was changed. Please try again.',
  SaveDenied: 'Markvy can’t save here: no permission to change this file.',
  DraftsFailing: 'Unsaved changes are not being backed up.',
  PictureRejected: 'Only PNG, JPG, GIF and WebP pictures up to 20 MB can be added.',
  Unavailable: 'This folder is no longer available.',
  Lossy: 'Some characters in this document may not display correctly.',
  ChangedOnDisk: 'This page changed on disk. Your edits are kept; Save will offer to combine them.',
} as const;

export const NAME_MESSAGES = {
  Empty: 'Type a name.',
  Invalid: 'Names can’t contain < > : " / \\ | ? * or start with a dot or end with a dot or space.',
  Reserved: 'Windows reserves that name. Try another.',
  Taken: 'Something in this folder already has that name.',
  TooLong: 'That name makes the path too long.',
  WrongType: 'Pages must end in .md, .markdown or .txt.',
} as const;

const CODES: readonly ErrorCode[] = ['NotFound', 'CollectionUnavailable', 'AccessDenied', 'OutsideCollection', 'TooLarge', 'NotText', 'Internal', 'ImageFailed', 'ImageRejected', 'LinkRefused', 'FileInUse', 'DiskFull', 'NotEditable', 'NameRefused', 'NoRecycleBin', 'Changed'];

export function describeError(e: unknown): string {
  const err = e as Partial<AppError> | null;
  const code = err?.code;
  if (code === 'NameRefused' && err?.details && err.details in NAME_MESSAGES) return NAME_MESSAGES[err.details as keyof typeof NAME_MESSAGES];
  return code && CODES.includes(code) ? MESSAGES[code] : MESSAGES.Internal;
}

export const isAppError = (e: unknown): e is AppError =>
  !!e && typeof e === 'object' && CODES.includes((e as AppError).code);

/** What "Copy details" puts on the clipboard: the version, the time and the error, on one line. */
export function errorDetails(e: AppError, at = new Date()): string {
  return [`Markvy ${__APP_VERSION__}`, at.toISOString(), e.details ? `${e.code}: ${e.details}` : e.code].join(' · ');
}

/** README or index at the top level, else the first document in tree order. */
export function firstDocument(node: TreeNode): string | null {
  const docs = node.children.filter((c) => c.kind === 'document');
  const preferred = docs.find((d) => /^(readme|index)\.(md|markdown)$/i.test(d.name)) ?? docs[0];
  if (preferred) return preferred.path;
  for (const c of node.children) if (c.kind === 'folder') { const found = firstDocument(c); if (found) return found; }
  return null;
}
