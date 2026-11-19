<script lang="ts">
  import { untrack } from 'svelte';
  import Dialog from './Dialog.svelte';
  import Icon from './Icon.svelte';
  import { describeError } from './lib/core';
  import { describeDocument, type DocumentDetails } from './lib/details';
  import { formatDate, formatSize } from './lib/format';
  import { parseKey } from './lib/library';
  import { renderDocument } from './lib/markdown/render';
  import { app, assetUrl } from './state/app.svelte';

  let { docKey: key }: { docKey: string } = $props();
  interface Info { title: string; size: number; modified: number | null; details: DocumentDetails }
  let info = $state<Info | null>(null);
  let failed = $state<string | null>(null);
  const loc = $derived(parseKey(key));
  const folder = $derived(app.collections.find((c) => c.id === loc.collectionId)?.name ?? '');
  const isFav = $derived(app.library.favorites.includes(key));
  const editable = $derived(app.canManageFiles(loc.collectionId));
  const isTxt = $derived(/\.txt$/i.test(loc.path));
  const close = () => app.showDetails(null);

  $effect(() => {
    let cancelled = false;
    const { collectionId, path } = parseKey(key);
    // untrack: ensureTree reads app.trees, which live reload reassigns; load once per dialog.
    untrack(() => Promise.all([app.loadDocument(key), app.ensureTree(collectionId)]))
      .then(([doc, tree]) => {
        if (cancelled) return;
        const r = renderDocument(doc.text, { collectionId, path, files: tree ? app.filesFor(collectionId) : [], assetUrl });
        info = { title: r.title, size: doc.size, modified: doc.modifiedMs, details: describeDocument(r.article, doc.text, r.frontmatter) };
      })
      .catch((e) => {
        if (!cancelled) failed = describeError(e);
      });
    return () => {
      cancelled = true;
    };
  });
</script>

<Dialog title="Document details" wide onclose={close}>
  {#if failed}
    <p>{failed}</p>
  {:else if info}
    {@const d = info.details}
    <table class="info-table"><tbody>
      <tr><th scope="row">Title</th><td>{info.title}</td></tr>
      <tr><th scope="row">Folder</th><td>{folder}</td></tr>
      <tr><th scope="row">Location</th><td>{loc.path}</td></tr>
      <tr><th scope="row">Type</th><td>{isTxt ? 'Plain text document' : 'Markdown document (plain text with formatting marks)'}</td></tr>
      <tr><th scope="row">File size</th><td>{formatSize(info.size)}</td></tr>
      {#if info.modified}<tr><th scope="row">Last changed</th><td>{formatDate(info.modified)}</td></tr>{/if}
      <tr><th scope="row">Length</th><td>{d.words.toLocaleString()} words · about {Math.max(1, Math.round(d.words / 200))} min to read</td></tr>
      <tr><th scope="row">Sections</th><td>{d.sections}</td></tr>
      <tr><th scope="row">Links</th><td>{d.pageLinks} to other pages · {d.webLinks} to websites{#if d.broken.length} · <span style="color:var(--danger)">{d.broken.length} broken ({d.broken.join(', ')})</span>{/if}</td></tr>
      <tr><th scope="row">Pictures</th><td>{d.localPictures} stored with the document · {d.remotePictures} from the internet</td></tr>
      <tr><th scope="row">Your progress</th><td>{app.library.progress[key] ?? 0}% read</td></tr>
      <tr><th scope="row">Access</th><td>{#if editable}<Icon name="pencil" /> Editable. Markvy changes this file only when you press Save.{:else}<Icon name="lock" /> Read-only. Markvy never changes this file.{/if}</td></tr>
    </tbody></table>
    {#if d.written.length}
      <p class="dlg-sub">Details written in the document</p>
      <table class="info-table"><tbody>
        {#each d.written as [name, value] (name)}<tr><th scope="row">{name}</th><td>{value}</td></tr>{/each}
      </tbody></table>
    {/if}
  {:else}
    <p>Loading…</p>
  {/if}
  {#snippet actions()}
    <button class="btn" onclick={() => app.toggleFavorite(key)}>{isFav ? 'Remove from favorites' : 'Add to favorites'}</button>
    <button class="btn btn-primary" onclick={close}>Close</button>
  {/snippet}
</Dialog>
