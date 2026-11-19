export interface Entry { key: string; scroll: number; slug: string | null }
export interface Tab { id: number; history: Entry[]; index: number }
export interface Pane { tabs: Tab[]; activeId: number | null }
export type PaneIndex = 0 | 1;
export interface WorkspaceState { panes: [Pane, Pane]; split: boolean; ratio: number; activePane: PaneIndex; nextId: number }
export interface SessionPane { tabs: { key: string; scroll: number }[]; active: number }
export interface Session { panes: SessionPane[]; split: boolean; ratio: number; activeCollection: string | null; at: number }
export type OpenMode = 'tab' | 'navigate';

export const emptyWorkspace = (): WorkspaceState => ({
  panes: [{ tabs: [], activeId: null }, { tabs: [], activeId: null }], split: false, ratio: 0.5, activePane: 0, nextId: 1,
});

export const current = (tab: Tab): Entry => tab.history[tab.index];

export const activeTab = (ws: WorkspaceState, pane: PaneIndex = ws.activePane): Tab | undefined =>
  ws.panes[pane].tabs.find((t) => t.id === ws.panes[pane].activeId);

export const activeKey = (ws: WorkspaceState, pane: PaneIndex = ws.activePane): string | null => {
  const t = activeTab(ws, pane);
  return t ? current(t).key : null;
};

const newTab = (ws: WorkspaceState, key: string, slug: string | null): Tab =>
  ({ id: ws.nextId++, history: [{ key, scroll: 0, slug }], index: 0 });

/** 'tab' reuses a tab already showing the document, else opens one; 'navigate' moves the active tab forward. */
export function openDoc(ws: WorkspaceState, key: string, opts: { mode?: OpenMode; pane?: PaneIndex; slug?: string | null } = {}): void {
  const { mode = 'tab', slug = null } = opts;
  const target: PaneIndex = ws.split ? (opts.pane ?? ws.activePane) : 0;
  const pane = ws.panes[target];
  let tab = mode === 'tab' ? pane.tabs.find((t) => current(t).key === key) : activeTab(ws, target);
  if (!tab) {
    tab = newTab(ws, key, slug);
    pane.tabs.push(tab);
  } else if (current(tab).key === key) {
    if (slug) current(tab).slug = slug;
  } else {
    tab.history = tab.history.slice(0, tab.index + 1);
    tab.history.push({ key, scroll: 0, slug });
    tab.index = tab.history.length - 1;
  }
  pane.activeId = tab.id;
  ws.activePane = target;
}

export function go(ws: WorkspaceState, pane: PaneIndex, delta: -1 | 1): boolean {
  const tab = activeTab(ws, pane);
  if (!tab) return false;
  const next = tab.index + delta;
  if (next < 0 || next >= tab.history.length) return false;
  tab.index = next;
  return true;
}

export function activateTab(ws: WorkspaceState, pane: PaneIndex, id: number): void {
  if (!ws.panes[pane].tabs.some((t) => t.id === id)) return;
  ws.panes[pane].activeId = id;
  ws.activePane = pane;
}

export function closeTab(ws: WorkspaceState, pane: PaneIndex, id: number): void {
  const p = ws.panes[pane];
  const i = p.tabs.findIndex((t) => t.id === id);
  if (i < 0) return;
  p.tabs.splice(i, 1);
  if (p.activeId === id) p.activeId = (p.tabs[i] ?? p.tabs[i - 1])?.id ?? null;
}

/** Closes every tab showing a document of one folder, in both panes (the folder was removed from the list). */
export function closeCollection(ws: WorkspaceState, collectionId: string): void {
  for (const pane of ws.panes) {
    pane.tabs = pane.tabs.filter((t) => !current(t).key.startsWith(`${collectionId}/`));
    if (!pane.tabs.some((t) => t.id === pane.activeId)) pane.activeId = pane.tabs[0]?.id ?? null;
  }
}

export function setSplit(ws: WorkspaceState, on: boolean, companionKey: string | null): void {
  if (on === ws.split) return;
  if (on) {
    ws.split = true;
    if (!ws.panes[1].tabs.length && companionKey) {
      const tab = newTab(ws, companionKey, null);
      ws.panes[1].tabs.push(tab);
      ws.panes[1].activeId = tab.id;
    }
    ws.activePane = 1;
    return;
  }
  const [left, right] = ws.panes;
  for (const tab of right.tabs) if (!left.tabs.some((t) => current(t).key === current(tab).key)) left.tabs.push(tab);
  if (left.activeId === null && left.tabs.length) left.activeId = left.tabs[0].id;
  right.tabs.splice(0);
  right.activeId = null;
  ws.split = false;
  ws.activePane = 0;
}

export function setRatio(ws: WorkspaceState, r: number): void {
  ws.ratio = Number.isFinite(r) ? Math.min(0.75, Math.max(0.25, r)) : 0.5;
}

export function toSession(ws: WorkspaceState, activeCollection: string | null, now = Date.now()): Session {
  return {
    split: ws.split,
    ratio: ws.ratio,
    activeCollection,
    at: now,
    panes: ws.panes.map((p) => ({
      tabs: p.tabs.map((t) => ({ key: current(t).key, scroll: Math.round(current(t).scroll) })),
      active: Math.max(0, p.tabs.findIndex((t) => t.id === p.activeId)),
    })),
  };
}

/** Rebuilds a workspace, dropping any tab whose key `keep` rejects (a removed folder, a deleted file). */
export function fromSession(session: Session, keep: (key: string) => boolean): WorkspaceState {
  const ws = emptyWorkspace();
  session.panes.slice(0, 2).forEach((sp, i) => {
    const pane = ws.panes[i as PaneIndex];
    const saved = Array.isArray(sp?.tabs) ? sp.tabs : [];
    const want = Math.trunc(Number(sp?.active) || 0); // an index into the saved list, not the kept one
    let activeId: number | null = null;
    let before: number | null = null; // the nearest kept tab before `want`
    for (let idx = 0; idx < saved.length; idx++) {
      const t = saved[idx];
      if (!t || typeof t.key !== 'string' || !keep(t.key)) continue;
      const tab = newTab(ws, t.key, null);
      tab.history[0].scroll = typeof t.scroll === 'number' ? t.scroll : 0;
      pane.tabs.push(tab);
      if (idx === want) activeId = tab.id;
      if (idx < want) before = tab.id;
    }
    pane.activeId = activeId ?? before ?? pane.tabs[0]?.id ?? null;
  });
  setRatio(ws, typeof session.ratio === 'number' ? session.ratio : 0.5);
  if (ws.panes[1].tabs.length) {
    ws.split = true;
    if (!session.split) setSplit(ws, false, null); // a stray right side merges into the left
  }
  ws.activePane = 0;
  return ws;
}
