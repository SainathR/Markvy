import { describe, expect, it } from 'vitest';
import { activeKey, activeTab, closeCollection, closeTab, current, emptyWorkspace, fromSession, go, openDoc, setRatio, setSplit, toSession, type Session } from './workspace';

describe('workspace', () => {
  it('opens a document in a new tab, and re-activates an open one', () => {
    const ws = emptyWorkspace();
    openDoc(ws, 's/a.md');
    openDoc(ws, 's/b.md');
    openDoc(ws, 's/a.md', { slug: 'intro' });
    expect(ws.panes[0].tabs).toHaveLength(2);
    expect(activeKey(ws)).toBe('s/a.md');
    expect(current(activeTab(ws)!).slug).toBe('intro');
  });

  it('navigates inside a tab with back and forward history', () => {
    const ws = emptyWorkspace();
    openDoc(ws, 's/a.md');
    openDoc(ws, 's/b.md', { mode: 'navigate' });
    openDoc(ws, 's/c.md', { mode: 'navigate' });
    expect(ws.panes[0].tabs).toHaveLength(1);
    expect(go(ws, 0, -1)).toBe(true);
    expect(activeKey(ws)).toBe('s/b.md');
    openDoc(ws, 's/d.md', { mode: 'navigate' });
    expect(go(ws, 0, 1)).toBe(false); // forward history was replaced
    expect(activeTab(ws)!.history.map((e) => e.key)).toEqual(['s/a.md', 's/b.md', 's/d.md']);
  });

  it('closes a tab and activates its neighbour', () => {
    const ws = emptyWorkspace();
    ['s/a.md', 's/b.md', 's/c.md'].forEach((k) => openDoc(ws, k));
    openDoc(ws, 's/b.md');
    closeTab(ws, 0, activeTab(ws)!.id);
    expect(activeKey(ws)).toBe('s/c.md');
  });

  it('splits with a companion document and merges back without duplicates', () => {
    const ws = emptyWorkspace();
    openDoc(ws, 's/a.md');
    openDoc(ws, 's/b.md', { pane: 1 }); // not split yet: goes to pane 0
    expect(ws.panes[0].tabs).toHaveLength(2);
    setSplit(ws, true, 's/g.md');
    expect(ws.activePane).toBe(1);
    expect(activeKey(ws, 1)).toBe('s/g.md');
    openDoc(ws, 's/a.md', { pane: 1 });
    setSplit(ws, false, null);
    expect(ws.split).toBe(false);
    expect(ws.panes[1].tabs).toHaveLength(0);
    expect(ws.panes[0].tabs.map((t) => current(t).key)).toEqual(['s/a.md', 's/b.md', 's/g.md']);
  });

  it('clamps the split ratio', () => {
    const ws = emptyWorkspace();
    setRatio(ws, 0.1);
    expect(ws.ratio).toBe(0.25);
    setRatio(ws, 0.9);
    expect(ws.ratio).toBe(0.75);
  });

  it('round-trips a session', () => {
    const ws = emptyWorkspace();
    openDoc(ws, 's/a.md');
    openDoc(ws, 's/b.md');
    activeTab(ws)!.history[0].scroll = 420.6;
    setSplit(ws, true, 's/g.md');
    const back = fromSession(toSession(ws, 's', 7), () => true);
    expect(back.split).toBe(true);
    expect(back.panes[0].tabs.map((t) => current(t).key)).toEqual(['s/a.md', 's/b.md']);
    expect(current(activeTab(back, 0)!).key).toBe('s/b.md');
    expect(current(activeTab(back, 0)!).scroll).toBe(421);
    expect(activeKey(back, 1)).toBe('s/g.md');
  });

  it('fromSession drops tabs whose key is rejected', () => {
    const session = { split: true, ratio: 0.5, activeCollection: 'gone', at: 1, panes: [
      { tabs: [{ key: 'gone/a.md', scroll: 0 }, { key: 's/b.md', scroll: 0 }], active: 0 },
      { tabs: [{ key: 'gone/c.md', scroll: 0 }], active: 0 },
    ] };
    const ws = fromSession(session, (k) => !k.startsWith('gone/'));
    expect(ws.panes[0].tabs.map((t) => current(t).key)).toEqual(['s/b.md']);
    expect(activeKey(ws, 0)).toBe('s/b.md');
    expect(ws.split).toBe(false); // the right side had nothing left
  });

  it('fromSession keeps the saved active tab when earlier tabs are dropped', () => {
    const keep = (k: string) => !k.startsWith('gone/');
    const session = (keys: string[], active: number): Session => ({ split: false, ratio: 0.5, activeCollection: 's', at: 1, panes: [
      { tabs: keys.map((key) => ({ key, scroll: 0 })), active },
      { tabs: [], active: 0 },
    ] });
    const activeOf = (s: Session) => activeKey(fromSession(s, keep), 0);
    expect(activeOf(session(['gone/A.md', 's/B.md', 's/C.md'], 1))).toBe('s/B.md');
    expect(activeOf(session(['gone/A.md', 's/B.md', 's/C.md'], 1.5))).toBe('s/B.md');
    expect(activeOf(session(['gone/A.md', 's/B.md', 's/C.md'], -3))).toBe('s/B.md');
    expect(activeOf(session(['s/A.md', 'gone/B.md', 'gone/C.md', 's/D.md'], 2))).toBe('s/A.md');
  });

  it('closeCollection removes that folder\'s tabs from both panes', () => {
    const ws = emptyWorkspace();
    openDoc(ws, 'a/1.md');
    openDoc(ws, 'b/1.md');
    setSplit(ws, true, 'a/2.md');
    closeCollection(ws, 'a');
    expect(ws.panes[0].tabs.map((t) => current(t).key)).toEqual(['b/1.md']);
    expect(ws.panes[0].activeId).toBe(ws.panes[0].tabs[0].id);
    expect(ws.panes[1].tabs).toEqual([]);
    expect(ws.panes[1].activeId).toBeNull();
  });

  it('setRatio ignores NaN', () => {
    const ws = emptyWorkspace();
    setRatio(ws, 0.3);
    setRatio(ws, NaN);
    expect(ws.ratio).toBe(0.5);
  });

  it('fromSession survives corrupted input', () => {
    const pane = (tabs: unknown, active: unknown) => ({ tabs, active });
    const cases = [
      { panes: [pane([{ key: 's/a.md', scroll: 0 }], 0), pane([], 0), pane([{ key: 's/b.md', scroll: 0 }], 0)], split: true, ratio: 0.5, activeCollection: null, at: 1 },
      { panes: [pane([null, { key: 's/a.md', scroll: 0 }], 0)], split: false, ratio: 0.5, activeCollection: null, at: 1 },
      { panes: [pane('x', 0)], split: false, ratio: 0.5, activeCollection: null, at: 1 },
      { panes: [pane([{ key: 's/a.md', scroll: 0 }], -3)], split: false, ratio: 0.5, activeCollection: null, at: 1 },
      { panes: [pane([{ key: 's/a.md', scroll: 0 }], 0)], split: false, ratio: 'wide', activeCollection: null, at: 1 },
      { panes: [], split: false, ratio: 0.5, activeCollection: null, at: 1 },
    ] as unknown as Session[];
    for (const bad of cases) {
      const ws = fromSession(bad, () => true);
      expect(ws.panes).toHaveLength(2);
      const restoredIds = ws.panes.flatMap((p) => p.tabs.map((t) => t.id));
      openDoc(ws, 's/new.md');
      expect(activeKey(ws)).toBe('s/new.md');
      expect(restoredIds).not.toContain(activeTab(ws)!.id);
    }
  });
});
