<script lang="ts">
  import { tick } from 'svelte';
  import Dialog from './Dialog.svelte';
  import Icon from './Icon.svelte';
  import { timeAgo } from './lib/format';
  import { t } from './lib/i18n';
  import { arrangeRows, libraryRows, parseKey, type LibrarySort, type LibraryTab, type ListKind } from './lib/library';
  import { app } from './state/app.svelte';

  type Tab = LibraryTab | 'history';
  const TABS: [Tab, string, string][] = [
    ['recent', 'Recent', 'clock'], ['favorites', 'Favorites', 'star'], ['bookmarks', 'Bookmarks', 'bookmark'],
    ['progress', 'Reading progress', 'book'], ['history', 'Search history', 'search'],
  ];
  const EMPTY: Record<LibraryTab, string> = {
    recent: 'Documents you open will be listed here.',
    favorites: 'Select the star on any document to add it to your favorites.',
    bookmarks: 'While reading, select the bookmark button to save the section you’re in.',
    progress: 'Start reading a document to track your progress.',
  };
  const CLEAR: Partial<Record<Tab, string>> = { recent: 'Clear recent documents', bookmarks: 'Remove all bookmarks', history: 'Clear search history' };

  let tab = $state<Tab>('recent');
  let filter = $state('');
  let sort = $state<LibrarySort>('recent');
  let confirming = $state(false);
  let filterEl = $state<HTMLInputElement>();
  const lang = $derived(app.library.prefs.lang);
  const known = (key: string) => app.collections.some((c) => c.available && c.id === parseKey(key).collectionId);
  const location = (key: string) => {
    const { collectionId, path } = parseKey(key);
    return `${app.collections.find((c) => c.id === collectionId)?.name ?? ''} › ${path}`;
  };
  const counts = $derived(
    Object.fromEntries(TABS.map(([id]) => [id, id === 'history' ? app.library.searches.length : libraryRows(app.library, id, known).length])) as Record<Tab, number>,
  );
  const rows = $derived(tab === 'history' ? [] : arrangeRows(libraryRows(app.library, tab, known), filter, sort, location));
  const searches = $derived(app.library.searches.filter((s) => s.q.toLowerCase().includes(filter.trim().toLowerCase())));
  const listKind = (x: LibraryTab): ListKind | null => (x === 'progress' ? null : x);

  // After a removal or a clear, the row or button that had focus is gone; the filter is the stable place to land.
  function refocusFilter() {
    void tick().then(() => filterEl?.focus());
  }

  function onTabKey(e: KeyboardEvent) {
    if (e.altKey) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const i = TABS.findIndex(([id]) => id === tab);
    tab = TABS[(i + (e.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length][0];
    void tick().then(() => document.getElementById(`libtab-${tab}`)?.focus());
  }
</script>

<section class="view" id="view-library" aria-labelledby="lib-h">
  <div class="view-inner wide">
    <h1 class="vt" id="lib-h" tabindex="-1">{t(lang, 'library')}</h1>
    <p class="lede">Everything you've read, starred, bookmarked and searched for, in one place.</p>
    <div class="lib-tabs" role="tablist" aria-label="Library lists" tabindex="-1" onkeydown={onTabKey}>
      {#each TABS as [id, label, icon] (id)}
        <button role="tab" id="libtab-{id}" aria-selected={tab === id} aria-controls="lib-panel" tabindex={tab === id ? 0 : -1} onclick={() => (tab = id)}><Icon name={icon} />{label}<span class="count">{counts[id]}</span></button>
      {/each}
    </div>
    <div role="tabpanel" id="lib-panel" aria-labelledby="libtab-{tab}" tabindex="-1">
      <div class="lib-controls">
        <div class="filter"><Icon name="search" /><input type="search" aria-label="Filter this list" placeholder="Filter this list" bind:value={filter} bind:this={filterEl} /></div>
        {#if tab !== 'history'}
          <label>Sort by <select bind:value={sort}>
            <option value="recent">Most recent</option><option value="title">Title (A–Z)</option><option value="location">Location</option><option value="progress">Reading progress</option>
          </select></label>
        {/if}
        <span class="grow"></span>
        {#if CLEAR[tab] && counts[tab]}<button class="btn sm" onclick={() => (confirming = true)}>{CLEAR[tab]}</button>{/if}
      </div>
      {#if tab === 'history'}
        {#if searches.length}
          <div class="table-scroll"><table class="lib-table">
            <caption>{searches.length} recent {searches.length === 1 ? 'search' : 'searches'}</caption>
            <thead><tr><th scope="col">Search</th><th scope="col">When</th><th scope="col"><span class="vh">Actions</span></th></tr></thead>
            <tbody>
              {#each searches as s (s.q)}
                <tr><td class="t-title">{s.q}</td><td>{timeAgo(s.at)}</td><td><div class="actions">
                  <button class="btn sm" onclick={() => app.searchFor(s.q)}>Search again</button>
                  <button class="btn sm" aria-label="Remove “{s.q}” from history" onclick={() => { app.removeFromList('history', s.q); refocusFilter(); }}>Remove</button>
                </div></td></tr>
              {/each}
            </tbody>
          </table></div>
        {:else}<div class="empty-state">{filter.trim() ? 'No searches match the filter.' : 'You haven’t searched for anything yet.'}</div>{/if}
      {:else if rows.length}
        {@const kind = listKind(tab as LibraryTab)}
        <div class="table-scroll"><table class="lib-table">
          <caption>{rows.length} {rows.length === 1 ? 'item' : 'items'}</caption>
          <thead><tr><th scope="col">Document</th><th scope="col">Progress</th><th scope="col" class="hide-sm">{tab === 'bookmarks' ? 'Added' : tab === 'favorites' ? '' : 'Opened'}</th><th scope="col"><span class="vh">Actions</span></th></tr></thead>
          <tbody>
            {#each rows as r (r.id)}
              <tr>
                <td><span class="t-title">{r.heading ?? r.title}</span><span class="t-sub">{r.heading ? `In ${r.title} · ` : ''}{location(r.key)}</span></td>
                <td><span class="pct"><span class="mini-bar" aria-hidden="true"><span style="width:{r.progress}%"></span></span>{r.progress}%</span></td>
                <td class="hide-sm">{tab === 'favorites' ? '' : r.when ? timeAgo(r.when) : 'Not yet'}</td>
                <td><div class="actions">
                  <button class="btn sm" onclick={() => app.open(r.key, { slug: r.slug || null })}>Open</button>
                  <button class="btn sm hide-sm" onclick={() => app.openBeside(r.key, r.slug || null)}>Side by side</button>
                  <button class="icon-btn sm" aria-label="Details for {r.title}" title="Details for {r.title}" onclick={() => app.showDetails(r.key)}><Icon name="info" /></button>
                  {#if kind}<button class="icon-btn sm" aria-label="Remove {r.heading ?? r.title} from this list" title="Remove from this list" onclick={() => { app.removeFromList(kind, r.id); refocusFilter(); }}><Icon name="x" /></button>{/if}
                </div></td>
              </tr>
            {/each}
          </tbody>
        </table></div>
      {:else}
        <div class="empty-state">{filter.trim() ? 'Nothing matches the filter.' : EMPTY[tab as LibraryTab]}</div>
      {/if}
    </div>
  </div>
</section>

{#if confirming && (tab === 'recent' || tab === 'bookmarks' || tab === 'history')}
  {@const kind = tab}
  <Dialog title="{CLEAR[kind]}?" onclose={() => (confirming = false)}>
    <p>This only clears the list in Markvy. Your documents are not affected.</p>
    {#snippet actions()}
      <button class="btn" onclick={() => (confirming = false)}>Cancel</button>
      <button class="btn btn-primary" onclick={() => { app.clearList(kind); confirming = false; refocusFilter(); }}>Clear</button>
    {/snippet}
  </Dialog>
{/if}
