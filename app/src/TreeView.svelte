<script lang="ts">
  import Icon from './Icon.svelte';
  import type { TreeNode } from './lib/core';
  import { docKey } from './lib/library';
  import { friendlyName } from './lib/markdown/slug';
  import { app } from './state/app.svelte';
  import Self from './TreeView.svelte';

  let { collectionId, nodes, nested = false }: { collectionId: string; nodes: TreeNode[]; nested?: boolean } = $props();
  const current = $derived(app.view === 'reader' ? app.currentKey : null);
  const editable = $derived(app.canManageFiles(collectionId));
  const menu = $derived(app.fileMenu && app.fileMenu.cid === collectionId ? app.fileMenu : null);

  function openMenu(e: MouseEvent | KeyboardEvent, node: TreeNode) {
    if (!editable) return;
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    const byPointer = e instanceof MouseEvent && (e.clientX || e.clientY);
    app.fileMenu = { cid: collectionId, path: node.path, isFolder: node.kind === 'folder', x: byPointer ? e.clientX : r.left + 24, y: byPointer ? e.clientY : r.bottom, opener: el };
  }
  const treeKey = (e: KeyboardEvent, node: TreeNode) => {
    if ((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu') openMenu(e, node);
  };

  function closeMenu(refocus: boolean) {
    const opener = app.fileMenu?.opener;
    app.fileMenu = null;
    if (refocus) opener?.focus();
  }
  function choose(kind: 'new-page' | 'new-folder' | 'rename' | 'delete') {
    const m = app.fileMenu!;
    closeMenu(true);
    const folder = m.isFolder ? m.path : m.path.split('/').slice(0, -1).join('/');
    app.fileAction = kind === 'new-page' || kind === 'new-folder' ? { kind, cid: m.cid, folder } : { kind, cid: m.cid, path: m.path, isFolder: m.isFolder };
  }
  function menuKey(e: KeyboardEvent) {
    const items = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role="menuitem"]')];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') { e.preventDefault(); closeMenu(true); }
    else if (e.key === 'Tab') closeMenu(false);
    else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
  }
  const focusFirst = (el: HTMLElement) => el.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  const outside = (e: PointerEvent) => { if (!nested && app.fileMenu && !(e.target as Element).closest('.ctx-menu')) closeMenu(false); };
</script>

<svelte:window onpointerdown={outside} />

<ul class={nested ? 'tree-sub' : 'tree'}>
  {#each nodes as node (node.path)}
    {#if node.kind === 'folder'}
      {@const open = !app.closedFolders.has(`${collectionId}:${node.path}`)}
      <li class="tree-row">
        <button class="tree-item tree-dir" aria-expanded={open} onclick={() => app.toggleFolder(collectionId, node.path)}
          oncontextmenu={(e) => openMenu(e, node)} onkeydown={(e) => treeKey(e, node)}>
          <Icon name="chevron" cls="twisty" /><Icon name={open ? 'folder-open' : 'folder'} /><span class="ti-label">{node.name}</span>
        </button>
        {#if editable}
          <button class="tree-add" aria-label="New page in {node.name}" title="New page in {node.name}"
            onclick={() => (app.fileAction = { kind: 'new-page', cid: collectionId, folder: node.path })}><Icon name="file-plus" /></button>
        {/if}
        {#if open}<Self {collectionId} nodes={node.children} nested />{/if}
      </li>
    {:else if node.kind === 'document'}
      {@const key = docKey(collectionId, node.path)}
      <li>
        <button class="tree-item" aria-current={key === current ? 'page' : undefined} title="{node.path} (Shift-click opens it beside)"
          onclick={(e) => (e.shiftKey ? app.openBeside(key) : app.open(key))} oncontextmenu={(e) => openMenu(e, node)} onkeydown={(e) => treeKey(e, node)}>
          <Icon name="file" /><span class="ti-label">{friendlyName(node.path)}</span>
          {#if app.library.favorites.includes(key)}<Icon name="star-fill" cls="ti-star" />{/if}
        </button>
      </li>
    {/if}
  {/each}
</ul>

{#if !nested && menu}
  <ul class="ctx-menu" role="menu" aria-label="Actions for {friendlyName(menu.path)}" style="left:{menu.x}px;top:{menu.y}px" use:focusFirst onkeydown={menuKey}>
    <li role="none"><button role="menuitem" tabindex="-1" onclick={() => choose('new-page')}>New page</button></li>
    {#if menu.isFolder}<li role="none"><button role="menuitem" tabindex="-1" onclick={() => choose('new-folder')}>New folder</button></li>{/if}
    <li role="none"><button role="menuitem" tabindex="-1" onclick={() => choose('rename')}>Rename</button></li>
    <li role="none"><button role="menuitem" tabindex="-1" onclick={() => choose('delete')}>Delete</button></li>
  </ul>
{/if}
