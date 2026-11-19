<script lang="ts">
  import { untrack } from 'svelte';
  import Highlight from './Highlight.svelte';
  import Icon from './Icon.svelte';
  import { t } from './lib/i18n';
  import { docKey, parseKey } from './lib/library';
  import { friendlyName } from './lib/markdown/slug';
  import { app } from './state/app.svelte';

  const lang = $derived(app.library.prefs.lang);
  const q = $derived(app.query.q.trim());
  // The query the shown results came from; editing the box doesn't change them.
  const ran = $derived(app.resultsQuery ?? { q: '', wholeWords: false });
  const shown = $derived(ran.q.trim());
  const docOpen = $derived(app.currentKey);
  const colName = (id: string | null) => app.collections.find((c) => c.id === id)?.name ?? '';
  const folders = $derived(
    app.activeCollection ? [...new Set(app.filesFor(app.activeCollection).filter((p) => p.includes('/')).map((p) => p.split('/')[0]))].sort() : [],
  );
  const total = $derived(app.results?.reduce((n, r) => n + Math.max(1, r.total), 0) ?? 0);
  const scopeName = $derived(
    app.query.scope === 'all' ? 'everywhere' : app.query.scope === 'collection' ? `in “${colName(app.activeCollection)}”` : 'in this document',
  );
  const pending = $derived(Object.values(app.indexing).filter((p) => !p.done));
  const indexingText = $derived(
    pending.length
      ? `Still indexing: ${pending.reduce((n, p) => n + p.indexed, 0)} of ${pending.reduce((n, p) => n + p.total, 0)} documents read. Results may be incomplete.`
      : 'Still indexing. Results may be incomplete.',
  );

  // Changing where or how to search re-runs a search that has already run; typing waits for Search.
  $effect(() => {
    void [app.query.scope, app.query.headingsOnly, app.query.wholeWords, app.query.folder];
    untrack(() => {
      if (app.results !== null) void app.rerunSearch();
    });
  });

  // Keep the form valid when the document or folder it named goes away.
  $effect(() => {
    if (app.query.scope === 'document' && !docOpen) app.query.scope = 'all';
    if (app.query.scope === 'collection' && !app.activeCollection) app.query.scope = 'all';
    if (app.query.folder && !folders.includes(app.query.folder)) app.query.folder = '';
  });

  function submit(e: SubmitEvent) {
    e.preventDefault();
    if (q) app.searchFor(app.query.q);
  }
</script>

<section class="view" id="view-search" aria-labelledby="search-h">
  <div class="view-inner">
    <h1 class="vt" id="search-h" tabindex="-1">{t(lang, 'search')}</h1>
    <p class="lede">Search every folder, the folder you're in, or the document you're reading. Headings count as matches too.</p>
    <form class="search-form" role="search" onsubmit={submit}>
      <div class="search-wrap"><Icon name="search" /><input id="sq" type="search" autocomplete="off" aria-label="Search for" placeholder="For example: Wi-Fi, holds, remote images" bind:value={app.query.q} /></div>
      <button class="btn btn-primary" type="submit">{t(lang, 'search')}</button>
    </form>
    <div class="search-opts">
      <div class="seg" role="radiogroup" aria-label="Where to search">
        <label><input type="radio" name="scope" value="all" bind:group={app.query.scope} />Everywhere</label>
        <label style:opacity={app.activeCollection ? '' : '.5'}><input type="radio" name="scope" value="collection" bind:group={app.query.scope} disabled={!app.activeCollection} />This folder</label>
        <label style:opacity={docOpen ? '' : '.5'}><input type="radio" name="scope" value="document" bind:group={app.query.scope} disabled={!docOpen} />{docOpen ? `This document: ${friendlyName(parseKey(docOpen).path)}` : 'Current document'}</label>
      </div>
      <label class="check"><input type="checkbox" bind:checked={app.query.headingsOnly} />Headings only</label>
      <label class="check"><input type="checkbox" bind:checked={app.query.wholeWords} />Whole words</label>
      {#if app.query.scope === 'collection' && folders.length}
        <label class="check">Folder <select bind:value={app.query.folder}><option value="">All folders</option>{#each folders as f (f)}<option value={f}>{f}</option>{/each}</select></label>
      {/if}
    </div>
    <p class="summary" aria-live="polite">
      {#if shown && app.results}{app.results.length ? `${total} matching ${total === 1 ? 'section' : 'sections'} in ${app.results.length} ${app.results.length === 1 ? 'document' : 'documents'}, ${scopeName}` : `No results for “${shown}” ${scopeName}.`}{/if}
    </p>
    {#if shown && app.results && app.searchIndexing}<p class="muted small">{indexingText}</p>{/if}

    {#if !q || !app.results}
      <h2 class="section-h"><Icon name="clock" />Recent searches</h2>
      {#if app.library.searches.length}
        <ul class="chips">
          {#each app.library.searches.slice(0, 8) as s (s.q)}<li><button class="chip" onclick={() => app.searchFor(s.q)}><Icon name="search" />{s.q}</button></li>{/each}
        </ul>
      {:else}<p class="muted small">Your searches will be listed here.</p>{/if}
    {:else if !app.results.length}
      <div class="empty-state">
        <p>Nothing matched “{shown}”. Try fewer or different words{app.query.headingsOnly ? ', or turn off “Headings only”' : ''}.</p>
        {#if app.query.scope !== 'all'}<button class="btn" onclick={() => (app.query.scope = 'all')}>Search everywhere instead</button>{/if}
      </div>
    {:else}
      {#each app.results as r (r.collectionId + '/' + r.path)}
        {@const key = docKey(r.collectionId, r.path)}
        <article class="result">
          <h2><button onclick={() => app.openResult(key, null)}><Highlight text={r.title} q={shown} whole={ran.wholeWords} /></button></h2>
          <p class="r-path">{colName(r.collectionId)} › {r.path}{r.total > 3 ? ` · ${r.total} matching sections` : ''}</p>
          {#if r.hits.length}
            <ul>
              {#each r.hits as h, i (i)}
                <li><button class="hit-btn" onclick={() => app.openResult(key, h.slug || null)}>
                  <span class="hit-head"><Icon name="hash" />{#if h.heading}<Highlight text={h.heading} q={shown} whole={ran.wholeWords} />{:else}Introduction{/if}{#if h.headingMatch} <span class="badge accent">Heading match</span>{/if}</span>
                  <span class="hit-snip"><Highlight text={h.snippet} q={shown} whole={ran.wholeWords} /></span>
                </button></li>
              {/each}
            </ul>
          {/if}
        </article>
      {/each}
    {/if}
  </div>
</section>
