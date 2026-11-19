<script lang="ts">
  import { untrack } from 'svelte';
  import Icon from './Icon.svelte';
  import { describeError, MESSAGES } from './lib/core';
  import { clearMarks, firstMatchAfter, markMatches } from './lib/find';
  import { docKey as makeKey, parseKey } from './lib/library';
  import { renderDocument } from './lib/markdown/render';
  import { observeDiagrams } from './lib/mermaid';
  import { showRemoteImage } from './lib/remote';
  import { currentSlug, readingPercent, type HeadingInfo } from './lib/toc';
  import type { Entry, PaneIndex } from './lib/workspace';
  import { app, assetUrl } from './state/app.svelte';

  let { pane, docKey: key, entry }: { pane: PaneIndex; docKey: string; entry: Entry } = $props();
  let scroller = $state<HTMLElement>();
  let host = $state<HTMLElement>();
  let words = $state(0);
  let updated = $state<string | null>(null);
  let failed = $state<string | null>(null);
  let shown = $state(false);
  let article: HTMLElement | null = null;
  let headingEls: HTMLElement[] = [];
  let stopDiagrams = () => {};
  // Restoring the saved position: scroll events are ignored (they would overwrite it with a half-loaded page's)
  // until the reader's first input. The observer keeps the target while images and diagrams grow the page.
  let restoring = true;
  let restoreTarget = () => 0;
  let restoreObserver: ResizeObserver | undefined;
  let restoreEl: HTMLElement | undefined;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  const INPUTS = ['wheel', 'keydown', 'pointerdown', 'touchstart'] as const;

  const measure = (): HeadingInfo[] =>
    headingEls.map((h) => ({ slug: h.dataset.slug ?? '', text: h.textContent ?? '', level: Number(h.tagName[1]), top: h.offsetTop }));

  // Headings only: a link to a section carries the same data-slug and must not be the target.
  const slugTarget = (slug: string) =>
    [...(host?.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6') ?? [])].find((h) => h.dataset.slug === slug) ?? null;

  let marks = $state<HTMLElement[]>([]);
  let matchIndex = $state(0);
  const findQ = $derived(app.find[pane]?.key === key ? app.find[pane]!.q : null);

  function setCurrent(i: number) {
    matchIndex = (i + marks.length) % marks.length;
    marks.forEach((m, j) => m.classList.toggle('current', j === matchIndex));
  }

  function gotoMatch(i: number) {
    if (!marks.length || !scroller) return;
    setCurrent(i);
    const mark = marks[matchIndex];
    const top = mark.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - scroller.clientHeight / 3;
    scroller.scrollTo({ top, behavior: app.reducedMotion ? 'auto' : 'smooth' });
  }

  /** Highlights this pane's search in the document (no scrolling), or clears old highlights. Returns the search, if it applies here. */
  function markFind() {
    if (!article) return null;
    const f = app.find[pane];
    if (!f || f.key !== key) {
      clearMarks(article);
      marks = [];
      return null;
    }
    marks = markMatches(article, f.q, f.wholeWords);
    if (marks.length) setCurrent(0);
    return f;
  }

  /** Highlights the search and scrolls to the first match after the section it came from; once per search result. */
  function applyFind() {
    const f = markFind();
    if (!f || !article) return;
    stopRestore(); // the search result decides where to look, not the saved position
    entry.slug = null;
    if (marks.length) gotoMatch(firstMatchAfter(marks, article, f.slug));
    else if (f.slug) scrollToSlug(f.slug);
    f.applied = true; // a later remount (live reload) keeps the reader's place instead
    onScroll(); // record the position now; a smooth scroll's own events follow
  }

  function scrollToSlug(slug: string) {
    endRestore(); // a link or contents click is the reader taking over
    const target = slugTarget(slug);
    if (!target || !scroller) {
      app.notice = 'That section couldn’t be found. It may have been renamed.';
      return;
    }
    scroller.scrollTo({ top: target.offsetTop - 12, behavior: app.reducedMotion ? 'auto' : 'smooth' });
    target.focus({ preventScroll: true });
  }

  function stopRestore() {
    restoring = false;
    clearTimeout(settleTimer);
    restoreObserver?.disconnect();
    restoreObserver = undefined;
    for (const type of INPUTS) restoreEl?.removeEventListener(type, endRestore);
  }

  function endRestore() {
    if (!restoring) return;
    stopRestore();
    onScroll();
  }

  function startRestore(target: () => number) {
    if (!scroller || !article) return;
    restoreEl = scroller;
    restoreTarget = target;
    const apply = () => {
      scroller?.scrollTo({ top: restoreTarget(), behavior: 'instant' });
      clearTimeout(settleTimer);
      settleTimer = setTimeout(endRestore, 1000); // untouched page: finish once it stops changing size
    };
    apply();
    restoreObserver = new ResizeObserver(apply);
    restoreObserver.observe(article);
    for (const type of INPUTS) scroller.addEventListener(type, endRestore, { passive: true });
  }

  function onScroll() {
    if (!scroller || restoring || scroller.clientHeight === 0) return;
    entry.scroll = scroller.scrollTop;
    const pct = readingPercent(scroller.scrollTop, scroller.scrollHeight, scroller.clientHeight);
    app.reportScroll(pane, key, pct, currentSlug(measure(), scroller.scrollTop, scroller.clientHeight, scroller.scrollHeight));
  }

  function onClick(event: MouseEvent) {
    const review = (event.target as HTMLElement).closest<HTMLElement>('button[data-act="remote-img"]');
    if (review) {
      event.preventDefault();
      if (event.type === 'auxclick') return;
      const fig = review.closest<HTMLElement>('figure.remote-img');
      if (fig?.dataset.src) app.reviewImage(fig.dataset.src, fig.dataset.alt ?? '');
      return;
    }
    const link = (event.target as HTMLElement).closest('a');
    if (!link) return;
    event.preventDefault(); // every link is handled here: pages, sections, websites and broken links
    if (event.type === 'auxclick') return; // middle/right click: do nothing
    const { kind, path, slug } = link.dataset;
    if (kind === 'internal' && path) {
      const target = makeKey(parseKey(key).collectionId, path);
      if (event.shiftKey) app.openBeside(target, slug || null);
      else app.open(target, { mode: event.ctrlKey || event.metaKey ? 'tab' : 'navigate', pane, slug: slug || null });
    } else if (kind === 'anchor' && slug) scrollToSlug(slug);
    else if (kind === 'external' && link.dataset.url) app.followExternal(link.dataset.url);
    else if (kind === 'refused') app.notice = MESSAGES.LinkRefused;
    else if (kind === 'broken') app.showBroken(link.dataset.target ?? '', parseKey(key).collectionId);
  }

  /** Pictures from the internet: show the ones already fetched, and fetch the ones from sites the reader always allows. */
  function syncRemoteImages() {
    if (!article) return;
    for (const fig of article.querySelectorAll<HTMLElement>('figure.remote-img')) {
      const src = fig.dataset.src ?? '';
      const shown = app.shownImages[src];
      if (shown) showRemoteImage(fig, shown);
      else if (app.isSiteAllowed(src)) void app.loadRemoteImage(src);
    }
  }

  function discardDraft() {
    const { collectionId, path } = parseKey(key);
    delete app.drafts[key];
    app.api.discardDraft(collectionId, path).catch((e) => app.report(e));
  }

  // One run per mount: ReaderPane re-creates this component (keyed) for every tab or document change,
  // so a slow read for an earlier document can never land here (the `cancelled` flag covers unmounts).
  $effect(() => {
    let cancelled = false;
    const { collectionId, path } = parseKey(key);
    app.scrollers[pane] = scrollToSlug;
    // The folder's file list decides which links resolve, so wait for it too (a failed load renders with none).
    // untrack: ensureTree reads app.trees, which live reload reassigns; the effect must run once per mount.
    untrack(() => Promise.all([app.loadDocument(key), app.ensureTree(collectionId)]))
      .then(([doc, tree]) => {
        if (cancelled || !host || !scroller) return;
        const rendered = renderDocument(doc.text, { collectionId, path, files: tree ? app.filesFor(collectionId) : [], assetUrl, remoteImages: app.library.prefs.remoteImages });
        article = rendered.article;
        host.replaceChildren(article);
        headingEls = [...article.querySelectorAll<HTMLElement>('[data-slug]')].filter((h) => /^H[1-4]$/.test(h.tagName));
        words = (doc.text.match(/\S+/g) ?? []).length;
        const fm = rendered.frontmatter.updated;
        updated = typeof fm === 'string' ? fm : doc.modifiedMs ? new Date(doc.modifiedMs).toISOString().slice(0, 10) : null;
        if (doc.lossy) app.notice = MESSAGES.Lossy;
        stopDiagrams = observeDiagrams(article, app.dark);
        syncRemoteImages();
        app.headings[pane] = measure();
        shown = true;
        const f = app.find[pane];
        if (f?.key === key && !f.applied) applyFind();
        else {
          if (f && f.key !== key) app.clearFind(pane); // highlights belong to the document they were found in
          if (f?.key === key) markFind(); // a reload of the same document: highlights come back, the place is kept
          const slug = entry.slug;
          if (slug && slugTarget(slug)) {
            startRestore(() => (slugTarget(slug)?.offsetTop ?? 12) - 12);
            slugTarget(slug)?.focus({ preventScroll: true });
          } else {
            if (slug) app.notice = 'That section couldn’t be found. It may have been renamed.';
            const top = entry.scroll;
            startRestore(() => top);
          }
          entry.slug = null;
        }
      })
      .catch((e) => {
        if (cancelled) return;
        stopRestore();
        failed = describeError(e);
      });
    return () => {
      cancelled = true;
      stopRestore();
      stopDiagrams();
      // Per-pane state belongs to the document being closed; clear it so nothing stale is shown.
      app.headings[pane] = [];
      app.currentSlugs[pane] = null;
      app.liveProgress[pane] = 0;
      if (app.scrollers[pane] === scrollToSlug) app.scrollers[pane] = null;
    };
  });

  // A link to a section of the document already open here.
  $effect(() => {
    const slug = entry.slug;
    // Skip only the search's own pending section (applyFind handles it, until it has been applied); any other section request scrolls at once.
    const f = untrack(() => app.find[pane]);
    if (slug && headingEls.length && !(f && f.key === key && f.slug === slug && !f.applied)) {
      scrollToSlug(slug);
      entry.slug = null;
    }
  });

  // A search result opened in the document already showing here, or highlights cleared.
  $effect(() => {
    void app.find[pane];
    untrack(() => {
      if (article) applyFind();
    });
  });

  // A picture the reader approved (here or in another pane) arrives: swap it in.
  $effect(() => {
    void Object.keys(app.shownImages);
    untrack(syncRemoteImages);
  });

  // Theme change: draw the diagrams again in the new colours.
  $effect(() => {
    const dark = app.dark;
    if (!article) return;
    stopDiagrams();
    stopDiagrams = observeDiagrams(article, dark);
  });
</script>

{#if shown && findQ !== null}
  <div class="findbar">
    <Icon name="search" />
    <span class="grow" aria-live="polite">{#if marks.length}Match <strong>{matchIndex + 1}</strong> of {marks.length} for “{findQ}”{:else}No matches for “{findQ}” in this document{/if}</span>
    <button class="icon-btn sm" aria-label="Previous match" title="Previous match" disabled={!marks.length} onclick={() => gotoMatch(matchIndex - 1)}><Icon name="chev-up" /></button>
    <button class="icon-btn sm" aria-label="Next match" title="Next match" disabled={!marks.length} onclick={() => gotoMatch(matchIndex + 1)}><Icon name="chev-down" /></button>
    <button class="btn sm" onclick={() => { app.clearFind(pane); scroller?.focus(); }}>Clear highlights</button>
  </div>
{/if}
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="scroller" role="region" tabindex="0" aria-label="Document" bind:this={scroller} onscroll={onScroll}>
  <div class="page">
    {#if app.drafts[key]}
      {@const d = app.drafts[key]}
      <div class="banner" role="status">
        <span>Restore unsaved changes from {new Date(d.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}?</span>
        <button class="btn sm btn-primary" onclick={() => app.startEditing(key)}>Restore</button>
        <button class="btn sm" onclick={discardDraft}>Discard</button>
      </div>
    {/if}
    {#if failed}
      <div class="empty-pane"><Icon name="alert" cls="big" /><h2>{failed}</h2></div>
    {/if}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div bind:this={host} onclick={onClick} onauxclick={onClick}></div>
  </div>
</div>
<div class="statusbar">
  {#if !app.library.prefs.allowEditing || parseKey(key).collectionId === 'sample'}<span class="ro" title="This page can’t be edited here"><Icon name="lock" />Read-only</span>{/if}
  {#if words}
    <span>{words.toLocaleString()} words · about {Math.max(1, Math.round(words / 200))} min</span>
    <span>{Math.round(app.liveProgress[pane])}% read</span>
  {/if}
  {#if updated}<span>Updated {updated}</span>{/if}
</div>
