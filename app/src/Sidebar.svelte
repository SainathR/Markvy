<script lang="ts">
  import Icon from './Icon.svelte';
  import type { TreeNode } from './lib/core';
  import { t } from './lib/i18n';
  import { docKey, parseKey } from './lib/library';
  import { friendlyName } from './lib/markdown/slug';
  import { app } from './state/app.svelte';
  import TreeView from './TreeView.svelte';

  let filter = $state('');
  const lang = $derived(app.library.prefs.lang);
  const cid = $derived(app.activeCollection);
  const tree = $derived(cid ? app.trees[cid] : undefined);
  const query = $derived(filter.trim().toLowerCase());
  const known = (key: string) => app.collections.some((c) => c.available && c.id === parseKey(key).collectionId);

  function documents(node: TreeNode): string[] {
    return node.children.flatMap((c) => (c.kind === 'folder' ? documents(c) : c.kind === 'document' ? [c.path] : []));
  }
  const allDocs = $derived(tree ? documents(tree.root) : []);
  const matches = $derived(query ? allDocs.filter((p) => friendlyName(p).toLowerCase().includes(query) || p.toLowerCase().includes(query)) : []);
  const folderOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : t(lang, 'topLevel'));
</script>

<aside class="sidebar" id="sidebar" aria-label={t(lang, 'library')}>
  <section aria-labelledby="col-h">
    <h2 class="side-h" id="col-h">{t(lang, 'collections')}</h2>
    <ul>
      {#each app.collections as c (c.id)}
        <li>
          <button class="col-btn" aria-pressed={c.id === cid} disabled={!c.available} onclick={() => app.selectCollection(c.id)}>
            <Icon name={c.id === 'sample' ? 'book' : 'folder'} /><span>{c.name}</span>
            {#if !c.available}<span class="badge">{t(lang, 'unavailable')}</span>{/if}
          </button>
        </li>
      {/each}
    </ul>
    <div class="btn-row"><button class="btn sm" onclick={() => app.addFolder()}><Icon name="folder-open" />{t(lang, 'openFolder')}</button></div>
  </section>

  <section aria-labelledby="docs-h">
    <h2 class="side-h" id="docs-h">{t(lang, 'documents')}</h2>
    {#if cid && app.canManageFiles(cid)}
      <div class="btn-row"><button class="btn sm" onclick={() => (app.fileAction = { kind: 'new-page', cid, folder: '' })}><Icon name="file-plus" />New page</button><button class="btn sm" onclick={() => (app.fileAction = { kind: 'new-folder', cid, folder: '' })}><Icon name="folder" />New folder</button></div>
    {/if}
    <div class="filter"><Icon name="search" /><input type="search" bind:value={filter} placeholder={t(lang, 'filterDocs')} aria-label={t(lang, 'filterDocs')} /></div>
    {#if cid && tree}
      {#if query}
        {#if matches.length}
          <ul class="side-list">
            {#each matches as p (p)}
              <li><button class="tree-item" onclick={() => app.open(docKey(cid, p))}><Icon name="file" /><span class="ti-label">{friendlyName(p)}<span class="ti-path">{folderOf(p)}</span></span></button></li>
            {/each}
          </ul>
        {/if}
        <p class="side-empty" role="status">{matches.length ? '' : t(lang, 'noMatches')}</p>
      {:else}
        <TreeView collectionId={cid} nodes={tree.root.children} />
      {/if}
    {:else if cid && app.failedTrees.has(cid)}
      <p class="side-empty">{t(lang, 'treeFailed')} <button class="link-btn" onclick={() => app.ensureTree(cid)}>{t(lang, 'retry')}</button></p>
    {:else if cid}<p class="side-empty">{t(lang, 'loading')}</p>{/if}
  </section>

  <details open>
    <summary><Icon name="chevron" />{t(lang, 'favorites')}</summary>
    <ul class="side-list">
      {#each app.library.favorites.filter(known) as key (key)}
        <li><button class="tree-item" onclick={() => app.open(key)}><Icon name="file" /><span class="ti-label">{friendlyName(parseKey(key).path)}</span></button></li>
      {:else}<li><p class="side-empty">{t(lang, 'favoritesEmpty')}</p></li>{/each}
    </ul>
  </details>

  <details open>
    <summary><Icon name="chevron" />{t(lang, 'bookmarks')}</summary>
    <ul class="side-list">
      {#each app.library.bookmarks.filter((b) => known(b.key)).slice(0, 6) as b (b.id)}
        {@const doc = friendlyName(parseKey(b.key).path)}
        <li><button class="tree-item" title={doc} onclick={() => app.open(b.key, { slug: b.slug || null })}><Icon name="bookmark" /><span class="ti-label">{b.heading}<span class="ti-path">{doc}</span></span></button></li>
      {:else}<li><p class="side-empty">{t(lang, 'bookmarksEmpty')}</p></li>{/each}
    </ul>
  </details>

  <details open>
    <summary><Icon name="chevron" />{t(lang, 'recent')}</summary>
    <ul class="side-list">
      {#each app.library.recent.filter((r) => known(r.key)).slice(0, 5) as r (r.key)}
        <li><button class="tree-item" onclick={() => app.open(r.key)}><Icon name="file" /><span class="ti-label">{friendlyName(parseKey(r.key).path)}</span></button></li>
      {:else}<li><p class="side-empty">{t(lang, 'recentEmpty')}</p></li>{/each}
    </ul>
  </details>
</aside>
