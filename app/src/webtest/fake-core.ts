/** A simulated core for screen tests in a plain browser (spec §7, macOS row). Never part of the app build. */
import type { SearchResult, TreeNode } from '../lib/core';
import { slugify } from '../lib/markdown/slug';

const raw = import.meta.glob('../../tests/fixtures/sample-wiki/**/*.{md,svg}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const PREFIX = '../../tests/fixtures/sample-wiki/';
const files = new Map(Object.entries(raw).map(([k, v]) => [k.slice(PREFIX.length), v]));
const STORE = 'markvy-webtest-library';
export const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

// ?collection=docs adds a second, editable collection and has a saved session on it (Home offers Restore previous session), for the editing screen tests.
const DOCS = new URLSearchParams(location.search).get('collection') === 'docs';
const NOTES = [
  '# Notes', '', '## Shopping', '', '- Milk', '- Bread', '', '| Item | Count |', '| --- | --- |', '| Milk | 2 |', '',
  '```mermaid', 'flowchart LR', '  A --> B', '```', '',
].join('\n');
const docsFiles = new Map([['Notes.md', NOTES]]);
if (DOCS) (window as any).__fakeDoc = (path: string) => docsFiles.get(path); // read-only view for the screen tests
const filesOf = (cid: unknown) => (cid === 'docs' ? docsFiles : files);

const drafts = new Map<string, unknown>();
const fp = (text: string) => `h:${text.length}:${[...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)}`;
const join = (folder: unknown, name: unknown) => (folder ? `${folder}/${name}` : String(name));

function tree(files: Map<string, string>, name = 'Sample library'): TreeNode {
  const root: TreeNode = { name, path: '', kind: 'folder', children: [] };
  for (const rel of files.keys()) {
    let node = root;
    const parts = rel.split('/');
    parts.forEach((part, i) => {
      const path = parts.slice(0, i + 1).join('/');
      const last = i === parts.length - 1;
      let child = node.children.find((c) => c.name === part);
      if (!child) {
        child = { name: part, path, kind: last ? (part.endsWith('.md') ? 'document' : 'image') : 'folder', children: [] };
        node.children.push(child);
      }
      node = child;
    });
  }
  // The real core (workspace.rs, walk): files first, then folders, each by lower-cased name.
  const byName = (a: TreeNode, b: TreeNode) => (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : a.name.toLowerCase() > b.name.toLowerCase() ? 1 : 0);
  const sort = (n: TreeNode) => {
    const isDir = (c: TreeNode) => c.kind === 'folder';
    n.children = [...n.children.filter((c) => !isDir(c)).sort(byName), ...n.children.filter(isDir).sort(byName)];
    n.children.forEach(sort);
  };
  sort(root);
  return root;
}

function search(query: string): SearchResult[] {
  const q = query.toLowerCase();
  const results: SearchResult[] = [];
  for (const [path, text] of files) {
    if (!path.endsWith('.md') || !q) continue;
    const lines = text.split(/\r?\n/);
    const title = lines.find((l) => l.startsWith('# '))?.slice(2) ?? path;
    let heading = title, level = 1;
    const hits: SearchResult['hits'] = [];
    for (const line of lines) {
      const m = /^(#{1,6})\s+(.*)$/.exec(line);
      if (m) { heading = m[2]; level = m[1].length; }
      if (line.toLowerCase().includes(q)) hits.push({ slug: slugify(heading), heading, level, snippet: line.replace(/^#+\s*/, '').slice(0, 160), headingMatch: !!m });
    }
    if (hits.length) results.push({ collectionId: 'sample', path, title, titleMatch: title.toLowerCase().includes(q), total: hits.length, hits: hits.slice(0, 5) });
  }
  return results;
}

export function handle(cmd: string, args: Record<string, unknown>): unknown {
  const files = filesOf(args.collectionId); // search and get_tree pick their own
  switch (cmd) {
    case 'list_collections': return [{ id: 'sample', name: 'Sample library', root: '/sample-wiki', available: true }, ...(DOCS ? [{ id: 'docs', name: 'Docs', root: '/docs', available: true }] : [])];
    case 'get_tree': return args.collectionId === 'docs' ? { root: tree(docsFiles, 'Docs'), truncated: false } : { root: tree(files), truncated: false };
    case 'read_document': {
      const text = files.get(String(args.path));
      if (text === undefined || !String(args.path).endsWith('.md')) throw { code: 'NotFound' };
      return { text, size: text.length, modifiedMs: null, lossy: false };
    }
    case 'search': return { results: search(String(args.query)), indexing: false };
    case 'load_library': {
      const lib = JSON.parse(sessionStorage.getItem(STORE) ?? '{"version":1}');
      if (DOCS) lib.session = { panes: [{ tabs: [{ key: 'docs/Notes.md', scroll: 0 }], active: 0 }, { tabs: [], active: 0 }], split: false, ratio: 0.5, activeCollection: 'docs', at: Date.now() };
      return { library: lib, reset: false };
    }
    case 'save_library': sessionStorage.setItem(STORE, JSON.stringify(args.library)); return null;
    case 'fetch_remote_image': return { mime: 'image/png', base64: PNG_1PX };
    case 'open_external': (window as any).__openedExternally = [...((window as any).__openedExternally ?? []), args.url]; return null;
    case 'pick_folder': case 'pick_file': return null;
    case 'forget_collection': case 'open_log_folder': return null;
    case 'take_recovery': {
      const r = new URLSearchParams(location.search).get('recovered');
      return r === null ? null : { restoreSession: r === 'restore', startedAtMs: 0 };
    }
    case 'set_editing_allowed': return null;
    case 'open_for_edit': case 'file_fingerprint': {
      const text = files.get(String(args.path));
      if (text === undefined) throw { code: 'NotFound' };
      return cmd === 'file_fingerprint' ? fp(text) : { text, hash: fp(text) };
    }
    case 'save_document': {
      const current = files.get(String(args.path)) ?? '';
      if (fp(current) !== args.baseHash) return { status: 'conflict', text: current, hash: fp(current) };
      files.set(String(args.path), String(args.text));
      drafts.delete(`${args.collectionId}/${args.path}`);
      return { status: 'saved', hash: fp(String(args.text)) };
    }
    case 'save_draft': { const d = args.draft as { collectionId: string; path: string }; drafts.set(`${d.collectionId}/${d.path}`, d); return null; }
    case 'take_draft': return drafts.get(`${args.collectionId}/${args.path}`) ?? null;
    case 'discard_draft': drafts.delete(`${args.collectionId}/${args.path}`); return null;
    case 'list_drafts': return [...drafts.values()];
    case 'create_page': { const p = join(args.folder, args.name); files.set(p, `# ${args.title}\n`); return p; }
    case 'create_folder': return join(args.parent, args.name);
    case 'rename_with_edits': {
      for (const e of args.edits as { path: string; text: string }[]) files.set(e.path, e.text);
      const from = String(args.from);
      const to = join(from.split('/').slice(0, -1).join('/'), args.newName);
      for (const [p, t] of [...files]) if (p === from || p.startsWith(from + '/')) { files.delete(p); files.set(to + p.slice(from.length), t); }
      return to;
    }
    case 'delete_entry': { const p = String(args.path); for (const k of [...files.keys()]) if (k === p || k.startsWith(p + '/')) files.delete(k); return null; }
    case 'save_picture': return `images/${String(args.page).split('/').pop()!.replace(/\.\w+$/, '')}-1.png`;
    default: throw { code: 'Internal', details: `simulated core has no ${cmd}` };
  }
}
