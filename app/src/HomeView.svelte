<script lang="ts">
  import { tick } from 'svelte';
  import Dialog from './Dialog.svelte';
  import Icon from './Icon.svelte';
  import type { Collection } from './lib/core';
  import { t } from './lib/i18n';
  import { docKey, parseKey } from './lib/library';
  import { friendlyName } from './lib/markdown/slug';
  import { app } from './state/app.svelte';

  let removing = $state<Collection | null>(null);
  const lang = $derived(app.library.prefs.lang);
  const hasSample = $derived(app.collections.some((c) => c.id === 'sample' && c.available));
  const known = (key: string) => app.collections.some((c) => c.available && c.id === parseKey(key).collectionId);
  const sessionKeys = $derived(app.savedSession
    ? [...new Set(app.savedSession.panes.slice(0, 2).flatMap((p) => (Array.isArray(p?.tabs) ? p.tabs : [])).filter((x) => x && typeof x.key === 'string').map((x) => x.key).filter(known))]
    : []);
  const recent = $derived(app.library.recent.filter((r) => known(r.key)).slice(0, 5));
  const suggested = $derived(hasSample ? ['README.md', 'Getting-Started.md', 'Guides/Introduction.md'].map((p) => docKey('sample', p)) : []);
  const folders = $derived([...app.collections].sort((a, b) => Number(app.library.favoriteCollections.includes(b.id)) - Number(app.library.favoriteCollections.includes(a.id))));
  // The row's button is gone afterwards, so keyboard focus moves to the folders heading.
  async function remove(id: string) {
    removing = null;
    await app.forgetCollection(id);
    await tick();
    document.getElementById('hc-h')?.focus();
  }
  const where = (key: string) => {
    const { collectionId, path } = parseKey(key);
    return `${app.collections.find((c) => c.id === collectionId)?.name ?? ''} › ${path}`;
  };
</script>

<section class="view" aria-labelledby="home-h">
  <div class="view-inner wide">
    <header class="home-hero">
      <p class="eyebrow">{t(lang, 'eyebrow')}</p>
      <h1 class="vt" id="home-h" tabindex="-1">{t(lang, 'welcome')}</h1>
      <p class="lede">{t(lang, 'welcomeSub')}</p>
      <div class="home-actions">
        <button class="action-card" onclick={() => app.openFile()}><Icon name="file-plus" /><span><strong>{t(lang, 'openFile')}</strong><small>{t(lang, 'openFileHint')}</small></span></button>
        <button class="action-card" onclick={() => app.addFolder()}><Icon name="folder-open" /><span><strong>{t(lang, 'openFolder')}</strong><small>{t(lang, 'openFolderHint')}</small></span></button>
        {#if hasSample}
          <button class="action-card primary" onclick={() => app.openSample()}><Icon name="book" /><span><strong>{t(lang, 'sample')}</strong><small>{t(lang, 'sampleHint')}</small></span></button>
        {/if}
      </div>
    </header>

    <div class="home-grid">
      <section aria-labelledby="hs-h">
        <h2 class="section-h" id="hs-h"><Icon name="restore" />{t(lang, 'continue')}</h2>
        {#if sessionKeys.length}
          <ul class="rows">{#each sessionKeys as k (k)}<li><Icon name="file" /><span class="row-main"><span class="row-title">{friendlyName(parseKey(k).path)}</span></span></li>{/each}</ul>
          <div class="btn-row">
            <button class="btn btn-primary" disabled={!app.ready} onclick={() => app.restoreSession()}>{t(lang, 'restore')}</button>
            <button class="btn" disabled={!app.ready} onclick={() => app.startFresh()}>{t(lang, 'fresh')}</button>
          </div>
        {:else}
          <p class="muted small">{t(lang, 'noSession')}</p>
          <div class="btn-row"><button class="btn" disabled={!app.ready} onclick={() => app.startFresh()}>{t(lang, 'fresh')}</button></div>
        {/if}
      </section>

      <section aria-labelledby="hr-h">
        <h2 class="section-h" id="hr-h"><Icon name="clock" />{recent.length ? t(lang, 'recentDocs') : t(lang, 'suggested')}</h2>
        <ul class="rows">
          {#each recent.length ? recent.map((r) => r.key) : suggested as k (k)}
            {@const pct = app.library.progress[k] ?? 0}
            <li>
              <Icon name="file" />
              <button class="row-open row-main" onclick={() => app.open(k)}><span class="row-title">{friendlyName(parseKey(k).path)}</span><span class="row-sub">{where(k)}</span></button>
              {#if recent.length}<span class="mini-bar" role="img" aria-label="{pct}% read" title="{pct}% read"><span style="width:{pct}%"></span></span>{/if}
            </li>
          {/each}
        </ul>
        {#if recent.length}<div class="btn-row"><button class="btn sm" onclick={() => (app.view = 'library')}>{t(lang, 'viewLibrary')}</button></div>{/if}
      </section>

      {#if Object.keys(app.drafts).length}
        <!-- Found here after a crash even when their tab is gone. -->
        <section aria-labelledby="hd-h">
          <h2 class="section-h" id="hd-h"><Icon name="pencil" />Unsaved changes</h2>
          <ul class="rows">
            {#each Object.entries(app.drafts) as [k, d] (k)}
              <li>
                <Icon name="file" />
                <button class="row-open row-main" onclick={() => app.open(k)}><span class="row-title">{friendlyName(d.path)}</span><span class="row-sub">{where(k)} · {new Date(d.savedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span></button>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      <section aria-labelledby="hc-h">
        <h2 class="section-h" id="hc-h" tabindex="-1"><Icon name="folder" />{t(lang, 'collections')}</h2>
        <ul class="rows">
          {#each folders as c (c.id)}
            {@const on = app.library.favoriteCollections.includes(c.id)}
            <li>
              <button class="star-btn" aria-pressed={on} aria-label="{on ? 'Remove' : 'Add'} {c.name} {on ? 'from' : 'to'} favorites" onclick={() => app.toggleFavoriteCollection(c.id)}><Icon name="star" /></button>
              <button class="row-open row-main" disabled={!c.available} onclick={() => app.openCollection(c.id)}>
                <span class="row-title">{c.name}</span><span class="row-sub">{c.available ? c.root : t(lang, 'unavailable')}</span>
              </button>
              {#if c.id !== 'sample'}<button class="icon-btn sm" aria-label="Remove {c.name} from your folders" title="Remove from your folders" onclick={() => (removing = c)}><Icon name="x" /></button>{/if}
            </li>
          {/each}
        </ul>
      </section>
    </div>
  </div>
</section>

{#if removing}
  {@const c = removing}
  <Dialog title="Remove “{c.name}” from your folders?" onclose={() => (removing = null)}>
    <p>Markvy will stop listing this folder. The folder and its documents stay on your computer, and you can open it again at any time.</p>
    {#snippet actions()}
      <button class="btn" onclick={() => (removing = null)}>Cancel</button>
      <button class="btn btn-primary" onclick={() => void remove(c.id)}>Remove from list</button>
    {/snippet}
  </Dialog>
{/if}
