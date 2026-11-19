<script lang="ts">
  import Icon from './Icon.svelte';
  import { t } from './lib/i18n';
  import { suggestionsFrom, type Suggestion } from './lib/search';
  import { app } from './state/app.svelte';

  let value = $state('');
  let items = $state<Suggestion[]>([]);
  let open = $state(false);
  let active = $state(-1);
  let seq = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const lang = $derived(app.library.prefs.lang);
  const name = (id: string) => app.collections.find((c) => c.id === id)?.name ?? '';

  function close() {
    open = false;
    active = -1;
    seq++; // a pending lookup is now stale
    clearTimeout(timer);
  }

  function refresh() {
    const q = value.trim();
    if (!q) return close();
    // Keep the list on screen until the new lookup lands: closing here would flicker on every keystroke.
    clearTimeout(timer);
    const mine = ++seq;
    active = -1;
    timer = setTimeout(async () => {
      const results = await app.suggest(q);
      if (mine !== seq) return;
      items = suggestionsFrom(results, name);
      open = true;
    }, 150);
  }

  /** `i === items.length` is the last row, "Search all documents". */
  function choose(i: number) {
    const q = value.trim();
    const s = items[i];
    close();
    value = '';
    if (!s) {
      if (q) app.searchFor(q);
    } else if (s.slug) {
      app.openResult(s.key, s.slug, q);
    } else {
      app.rememberSearch(q);
      app.open(s.key);
    }
  }

  function onKey(e: KeyboardEvent) {
    if (e.isComposing) return; // Enter that commits an IME composition is not a search
    const rows = items.length + 1;
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && open) {
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + rows) % rows;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (value.trim()) choose(open && active >= 0 ? active : items.length);
    } else if (e.key === 'Escape' && open) {
      e.stopPropagation();
      close();
    }
  }
</script>

<div class="search-wrap">
  <Icon name="search" />
  <input id="gsearch" type="search" autocomplete="off" role="combobox" aria-expanded={open} aria-controls="gsuggest" aria-autocomplete="list"
    aria-activedescendant={open && active >= 0 ? `sug-${active}` : undefined} aria-label={t(lang, 'searchPh')} placeholder={t(lang, 'searchPh')}
    bind:value oninput={refresh} onfocus={refresh} onblur={close} onkeydown={onKey} />
  <span class="kbd-hint" aria-hidden="true">/</span>
  {#if open}
    <!-- The input owns the keyboard (combobox pattern); rows only take the mouse. -->
    <ul class="suggest" id="gsuggest" role="listbox" aria-label="Suggestions">
      {#each items as s, i (i)}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <li role="option" id="sug-{i}" aria-selected={i === active} onmousedown={(e) => e.preventDefault()} onclick={() => choose(i)}>
          <Icon name={s.icon} /><span class="s-main"><span>{s.label}</span><span class="s-sub">{s.sub}</span></span>
        </li>
      {/each}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <li role="option" id="sug-{items.length}" aria-selected={active === items.length} onmousedown={(e) => e.preventDefault()} onclick={() => choose(items.length)}>
        <Icon name="search" /><span class="s-main"><span>Search all documents for “{value.trim()}”</span></span>
      </li>
    </ul>
  {/if}
</div>
