<script lang="ts">
  import { onMount, tick } from 'svelte';
  import AppBar from './AppBar.svelte';
  import BrokenLinkDialog from './BrokenLinkDialog.svelte';
  import DetailsDialog from './DetailsDialog.svelte';
  import Divider from './Divider.svelte';
  import FileActionDialog from './FileActionDialog.svelte';
  import ExternalLinkDialog from './ExternalLinkDialog.svelte';
  import HelpDialog from './HelpDialog.svelte';
  import HelpView from './HelpView.svelte';
  import HomeView from './HomeView.svelte';
  import IconSprite from './IconSprite.svelte';
  import LibraryView from './LibraryView.svelte';
  import { describeError } from './lib/core';
  import PrefsView from './PrefsView.svelte';
  import ReaderPane from './ReaderPane.svelte';
  import RemoteImageDialog from './RemoteImageDialog.svelte';
  import SearchView from './SearchView.svelte';
  import Sidebar from './Sidebar.svelte';
  import TocPanel from './TocPanel.svelte';
  import { app, type View } from './state/app.svelte';

  const columns = $derived(app.ws.split ? `minmax(0, ${app.ws.ratio}fr) .5rem minmax(0, ${1 - app.ws.ratio}fr)` : 'minmax(0, 1fr)');

  onMount(() => {
    void app.init();
    const scheme = matchMedia('(prefers-color-scheme: dark)');
    const onScheme = () => app.applyPrefs();
    scheme.addEventListener('change', onScheme);
    // A3: save the library and every draft when the window is hidden or the page goes away; otherwise after their delays.
    const onHide = () => {
      if (document.visibilityState === 'hidden') void app.flushAll();
    };
    const onPageHide = () => void app.flushAll();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      scheme.removeEventListener('change', onScheme);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
    };
  });

  // Move focus into the new view; the first run (start-up) must not steal focus.
  const FOCUS: Partial<Record<View, string>> = { home: '#home-h', prefs: '#prefs-h', library: '#lib-h', search: '#sq', help: '#help-h' };
  let firstRun = true;
  $effect(() => {
    const view = app.view;
    if (firstRun) {
      firstRun = false;
      return;
    }
    const target = FOCUS[view];
    void tick().then(() => {
      const el = target
        ? document.querySelector<HTMLElement>(target)
        : (document.querySelector<HTMLElement>('.pane.is-active .scroller, .pane .scroller') ?? document.getElementById('main'));
      el?.focus();
    });
  });

  function onKey(e: KeyboardEvent) {
    if (document.querySelector('dialog[open]')) return; // the dialog has the keyboard
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      document.getElementById('gsearch')?.focus();
      return;
    }
    const target = e.target as HTMLElement;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable;
    if (typing) return;
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      document.getElementById('gsearch')?.focus();
      return;
    }
    if (e.key === 'Escape' && app.view === 'reader' && app.find[app.ws.activePane]) {
      app.clearFind(app.ws.activePane);
      return;
    }
    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && app.view === 'reader') {
      e.preventDefault();
      if (e.key === 'ArrowLeft') app.goBack(app.ws.activePane);
      else app.goForward(app.ws.activePane);
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '[') app.toggleSidebar();
    else if (e.key === ']') app.toggleToc();
    else if (e.key === '\\') app.setSplit(!app.ws.split);
  }

  // No webview context menu on links ("open in new window"); plain text keeps its menu.
  function onContextMenu(e: MouseEvent) {
    if ((e.target as Element).closest?.('a')) e.preventDefault();
  }

  function onAuxClick(e: MouseEvent) {
    if ((e.target as Element).closest?.('a')) e.preventDefault();
  }
</script>

<svelte:window onkeydown={onKey} oncontextmenu={onContextMenu} onauxclick={onAuxClick} />
<IconSprite />
<a class="skip" href="#main">Skip to the document</a>
<div class="app">
  <AppBar />
  <div class="workspace" data-view={app.view} data-sidebar={app.sidebarOpen ? 'open' : 'closed'} data-toc={app.tocOpen ? 'open' : 'closed'}>
    <Sidebar />
    <main id="main" tabindex="-1">
      <div class="notice-region" role="status" aria-live="polite">
        {#if app.notice}
          <p class="notice">{app.notice}
            {#if app.lastError && app.notice === describeError(app.lastError)}<button class="link-btn" onclick={() => app.copyDetails()}>Copy details</button>{/if}
            <button class="link-btn" onclick={() => app.dismissNotice()}>Dismiss</button></p>
        {/if}
      </div>
      {#if app.view === 'home'}
        <HomeView />
      {:else if app.view === 'prefs'}
        <PrefsView />
      {:else if app.view === 'search'}
        <SearchView />
      {:else if app.view === 'library'}
        <LibraryView />
      {:else if app.view === 'help'}
        <HelpView />
      {:else}
        <section class="view" id="view-reader" aria-label="Reading">
          <div class="panes" class:is-split={app.ws.split} style:grid-template-columns={columns}>
            <ReaderPane pane={0} />
            {#if app.ws.split}<Divider /><ReaderPane pane={1} />{/if}
          </div>
        </section>
      {/if}
    </main>
    <TocPanel />
  </div>
</div>
{#if app.detailsKey}
  {#key app.detailsKey}<DetailsDialog docKey={app.detailsKey} />{/key}
{/if}
{#if app.externalUrl}{#key app.externalUrl}<ExternalLinkDialog url={app.externalUrl} />{/key}{/if}
{#if app.imageReview}{#key app.imageReview.url}<RemoteImageDialog url={app.imageReview.url} />{/key}{/if}
{#if app.brokenLink}<BrokenLinkDialog target={app.brokenLink.target} collectionId={app.brokenLink.collectionId} />{/if}
{#if app.helpOpen}<HelpDialog />{/if}
{#if app.fileAction}{#key app.fileAction}<FileActionDialog action={app.fileAction} />{/key}{/if}
