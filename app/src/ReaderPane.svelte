<script lang="ts">
  import DocumentView from './DocumentView.svelte';
  import Icon from './Icon.svelte';
  import { t } from './lib/i18n';
  import { docKey, parseKey } from './lib/library';
  import { friendlyName } from './lib/markdown/slug';
  import { current, type PaneIndex } from './lib/workspace';
  import { app } from './state/app.svelte';

  let { pane }: { pane: PaneIndex } = $props();
  const lang = $derived(app.library.prefs.lang);
  const p = $derived(app.ws.panes[pane]);
  const tab = $derived(p.tabs.find((x) => x.id === p.activeId));
  const entry = $derived(tab ? current(tab) : undefined);
  const key = $derived(entry?.key ?? null);
  const loc = $derived(key ? parseKey(key) : null);
  const collectionName = $derived(loc ? (app.collections.find((c) => c.id === loc.collectionId)?.name ?? '') : '');
  const folders = $derived(loc && loc.path.includes('/') ? loc.path.split('/').slice(0, -1) : []);
  const session = $derived(key ? app.sessions[key] : undefined);
  const canEdit = $derived(!!loc && app.library.prefs.allowEditing && loc.collectionId !== 'sample');
  // The editor is half the app's code: fetch it once the page is shown, so pressing Edit doesn't wait for it (spec: 300 ms).
  $effect(() => { if (canEdit) setTimeout(() => import('./EditorPane.svelte').catch(() => {})); /* Edit reports a real failure */ });
  const isFav = $derived(key ? app.library.favorites.includes(key) : false);
  const marked = $derived(app.isBookmarked(pane));
  const pct = $derived(key ? Math.round(app.liveProgress[pane]) : 0);
  const suggestions = $derived(['README.md', 'Getting-Started.md', 'References/Glossary.md'].map((path) => docKey('sample', path)).filter(() => app.collections.some((c) => c.id === 'sample' && c.available)));

  function onTabKey(e: KeyboardEvent) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const all = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('.tab-main')];
    const i = all.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    e.preventDefault();
    all[(i + (e.key === 'ArrowRight' ? 1 : -1) + all.length) % all.length].focus();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="pane" class:is-active={app.ws.split && app.ws.activePane === pane} data-pane={pane} onpointerdown={() => app.activatePane(pane)} onfocusin={() => app.activatePane(pane)}>
  <div class="tabbar">
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <nav class="tabs" aria-label={pane ? 'Open documents, right side' : 'Open documents'} onkeydown={onTabKey}>
      {#each p.tabs as tb (tb.id)}
        {@const k = current(tb).key}
        {@const name = friendlyName(parseKey(k).path)}
        <div class="tab" class:is-active={tb.id === p.activeId}>
          <button class="tab-main" aria-current={tb.id === p.activeId ? 'true' : undefined} title={parseKey(k).path} onclick={() => app.activateTab(pane, tb.id)}><Icon name="file" /><span>{name}</span>{#if app.sessions[k] && app.sessions[k].state !== 'clean'}<span class="draft-dot" title="Unsaved changes"><span class="sr-only">, unsaved changes</span></span>{/if}</button>
          <button class="tab-close" aria-label="Close {name}" title="Close" onclick={() => app.closeTab(pane, tb.id)}><Icon name="x" /></button>
        </div>
      {:else}
        <span class="tabs-empty">{t(lang, 'noDocument')}</span>
      {/each}
    </nav>
    {#if pane === 1}
      <div class="tabbar-end"><button class="icon-btn sm" aria-label="Close this side" title="Close this side" onclick={() => app.setSplit(false)}><Icon name="x" /></button></div>
    {/if}
  </div>
  <div class="toolbar">
    <button class="icon-btn sm" aria-label="Back (Alt + Left)" title="Back (Alt + Left)" disabled={!tab || tab.index <= 0} onclick={() => app.goBack(pane)}><Icon name="arrow-left" /></button>
    <button class="icon-btn sm" aria-label="Forward (Alt + Right)" title="Forward (Alt + Right)" disabled={!tab || tab.index >= tab.history.length - 1} onclick={() => app.goForward(pane)}><Icon name="arrow-right" /></button>
    <nav class="crumbs" aria-label="Location">
      {#if loc}
        <ol>
          <li><button title="Show this folder" onclick={() => app.revealFolder(loc.collectionId, '')}>{collectionName}</button></li>
          {#each folders as f, i (i)}
            <li><button title="Show this folder" onclick={() => app.revealFolder(loc.collectionId, folders.slice(0, i + 1).join('/'))}>{f}</button></li>
          {/each}
          <li aria-current="page"><span>{friendlyName(loc.path)}</span></li>
        </ol>
      {/if}
    </nav>
    <div class="tool-actions">
      {#if canEdit && key}
        <button class="icon-btn sm" aria-pressed={!!session} aria-label={session ? 'Editing this page' : 'Edit this page'} title="Edit this page" onclick={() => key && app.startEditing(key)}><Icon name="pencil" /></button>
      {/if}
      <button class="icon-btn sm" aria-pressed={isFav} aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'} title={isFav ? 'Remove from favorites' : 'Add to favorites'} disabled={!key} onclick={() => key && app.toggleFavorite(key)}><Icon name="star" /></button>
      <button class="icon-btn sm" aria-pressed={marked} aria-label={marked ? 'Remove bookmark for this section' : 'Bookmark this section'} title={marked ? 'Remove bookmark for this section' : 'Bookmark this section'} disabled={!key} onclick={() => app.toggleBookmark(pane)}><Icon name="bookmark" /></button>
      <button class="icon-btn sm" aria-label="Search in this document" title="Search in this document" disabled={!key} onclick={() => app.searchInDocument(pane)}><Icon name="search" /></button>
      <button class="icon-btn sm" aria-label="Document details" title="Document details" disabled={!key} onclick={() => key && app.showDetails(key)}><Icon name="info" /></button>
      {#if pane === 0}
        <button class="icon-btn sm" aria-pressed={app.ws.split} aria-label={app.ws.split ? 'Back to single page' : 'Read side by side'} title="{app.ws.split ? 'Back to single page' : 'Read side by side'} ( \ )" onclick={() => app.setSplit(!app.ws.split)}><Icon name="columns" /></button>
      {/if}
    </div>
  </div>
  <div class="progress" role="progressbar" aria-label="Reading progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={pct}><div class="progress-fill" style="width:{pct}%"></div></div>
  {#if key && entry && tab}
    {#if session && canEdit}
      <!-- Loaded on first use (the editor is half the app's code). Not keyed on versions: a change on disk must not reload the text being edited. -->
      {#await import('./EditorPane.svelte') then { default: EditorPane }}
        {#key `${tab.id}:${key}`}<EditorPane docKey={key} {session} />{/key}
      {/await}
    {:else}
      {#key `${tab.id}:${key}:${app.versions[key] ?? 0}`}
        <DocumentView {pane} docKey={key} {entry} />
      {/key}
    {/if}
  {:else}
    <div class="scroller"><div class="page"><div class="empty-pane">
      <Icon name="book" cls="big" />
      <h2>{t(lang, 'noDocument')}</h2>
      {#if suggestions.length}
        <p class="muted">{t(lang, 'chooseDocument')}</p>
        <ul>{#each suggestions as s (s)}<li><button class="link-btn" onclick={() => app.open(s, { pane })}>{friendlyName(parseKey(s).path)}</button></li>{/each}</ul>
      {/if}
      {#if pane === 1}<button class="btn" onclick={() => app.setSplit(false)}>Back to single page</button>{/if}
    </div></div></div>
    <div class="statusbar"></div>
  {/if}
</div>
