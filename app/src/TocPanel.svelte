<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';
  import Icon from './Icon.svelte';
  import { t } from './lib/i18n';
  import { buildToc, type TocNode } from './lib/toc';
  import { app } from './state/app.svelte';

  const lang = $derived(app.library.prefs.lang);
  const pane = $derived(app.ws.activePane);
  const nodes = $derived(buildToc(app.headings[pane]));
  const now = $derived(app.currentSlugs[pane]);
  const title = $derived(app.headings[pane].find((h) => h.level === 1)?.text ?? '');
  const collapsed = new SvelteSet<string>();

  const withChildren = (list: TocNode[]): string[] => list.flatMap((n) => (n.children.length ? [n.slug, ...withChildren(n.children)] : []));
  const go = (e: MouseEvent, slug: string) => {
    e.preventDefault();
    app.scrollers[pane]?.(slug);
  };
</script>

{#snippet list(items: TocNode[])}
  <ol>
    {#each items as n (n.slug)}
      <li>
        <div class="toc-row">
          {#if n.children.length}
            <button class="toc-twisty" aria-expanded={!collapsed.has(n.slug)} aria-label="Subsections of {n.text}"
              onclick={() => (collapsed.has(n.slug) ? collapsed.delete(n.slug) : collapsed.add(n.slug))}><Icon name="chevron" /></button>
          {:else}<span class="toc-spacer"></span>{/if}
          <a href="#{n.slug}" class="toc-link" class:current={n.slug === now} aria-current={n.slug === now ? 'location' : undefined} onclick={(e) => go(e, n.slug)}>{n.text}</a>
        </div>
        {#if n.children.length && !collapsed.has(n.slug)}{@render list(n.children)}{/if}
      </li>
    {/each}
  </ol>
{/snippet}

<aside class="toc" id="toc" aria-labelledby="toc-h">
  <div class="toc-head">
    <h2 id="toc-h">{t(lang, 'contents')}</h2>
    <div class="toc-tools">
      <button class="icon-btn sm" aria-label="Expand all sections" title="Expand all" onclick={() => collapsed.clear()}><Icon name="chev-down" /></button>
      <button class="icon-btn sm" aria-label="Collapse all sections" title="Collapse all" onclick={() => withChildren(nodes).forEach((s) => collapsed.add(s))}><Icon name="chev-up" /></button>
    </div>
  </div>
  <p class="toc-doc">{title}</p>
  <nav aria-label="Sections">
    {#if nodes.length}{@render list(nodes)}{:else}<p class="muted small">This document has no sections.</p>{/if}
  </nav>
</aside>
