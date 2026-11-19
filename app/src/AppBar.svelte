<script lang="ts">
  import AppearancePopover from './AppearancePopover.svelte';
  import GlobalSearch from './GlobalSearch.svelte';
  import Icon from './Icon.svelte';
  import { t } from './lib/i18n';
  import { app } from './state/app.svelte';

  let popOpen = $state(false);
  let appearanceBtn: HTMLButtonElement | undefined;
  const lang = $derived(app.library.prefs.lang);

  function closePopover(opts?: { restoreFocus: boolean }) {
    popOpen = false;
    if (opts?.restoreFocus) appearanceBtn?.focus();
  }
</script>

<header class="appbar">
  <button class="icon-btn toggle" aria-expanded={app.sidebarOpen && app.view !== 'home'} aria-controls="sidebar" aria-label={t(lang, 'toggleSidebar')} title="{t(lang, 'toggleSidebar')} ( [ )" onclick={() => app.toggleSidebar()}><Icon name="sidebar" /></button>
  <button class="brand" aria-label="Markvy — {t(lang, 'home')}" onclick={() => (app.view = 'home')}><Icon name="logo" /><span class="brand-name">Markvy</span></button>
  <GlobalSearch />
  <div class="bar-group" style="position:relative">
    <button class="icon-btn" aria-expanded={popOpen} aria-controls="appearance-pop" aria-label={t(lang, 'appearance')} title={t(lang, 'appearance')} bind:this={appearanceBtn} onclick={() => (popOpen = !popOpen)}><Icon name={app.dark ? 'moon' : 'sun'} /></button>
    {#if popOpen}<AppearancePopover onclose={closePopover} />{/if}
    <button class="icon-btn" aria-label={t(lang, 'library')} title={t(lang, 'library')} aria-current={app.view === 'library' ? 'page' : undefined} onclick={() => (app.view = 'library')}><Icon name="bookmark" /></button>
    <button class="icon-btn" aria-label="Help for this screen" title="Help for this screen" onclick={() => (app.helpOpen = true)}><Icon name="help" /></button>
    <button class="icon-btn" aria-label={t(lang, 'preferences')} title={t(lang, 'preferences')} onclick={() => (app.view = 'prefs')}><Icon name="gear" /></button>
    {#if app.view === 'reader'}
      <button class="icon-btn toggle" aria-expanded={app.tocOpen} aria-controls="toc" aria-label={t(lang, 'toggleContents')} title="{t(lang, 'toggleContents')} ( ] )" onclick={() => app.toggleToc()}><Icon name="toc" /></button>
    {/if}
  </div>
</header>
