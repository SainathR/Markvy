<script lang="ts">
  /* The dialog is re-created for each action (keyed in App.svelte), so initial values are enough. */
  import Dialog from './Dialog.svelte';
  import { NAME_MESSAGES } from './lib/core';
  import { inboundLinks, planRename } from './lib/editor/linkedit';
  import { nameProblem, suggestFileName } from './lib/editor/names';
  import { friendlyName } from './lib/markdown/slug';
  import { app, type FileAction } from './state/app.svelte';

  let { action }: { action: FileAction } = $props();
  let title = $state('');
  // svelte-ignore state_referenced_locally
  let name = $state(action.kind === 'rename' ? action.path.split('/').pop()! : '');
  // svelte-ignore state_referenced_locally
  let nameTouched = $state(action.kind === 'rename');
  let preview = $state<{ path: string; count: number }[] | null>(null);
  let skipped = $state<string[]>([]);
  let busy = $state(false);
  const folder = $derived('folder' in action ? action.folder : action.path.split('/').slice(0, -1).join('/'));
  const siblings = $derived(app.trees[action.cid] ? namesIn(folder) : []);
  const isDoc = $derived(action.kind === 'new-page' || (action.kind === 'rename' && !action.isFolder));
  const problem = $derived(nameProblem(name, siblings, { document: isDoc, except: action.kind === 'rename' ? action.path.split('/').pop() : undefined }));

  function namesIn(f: string): string[] {
    let node = app.trees[action.cid].root;
    for (const seg of f ? f.split('/') : []) node = node.children.find((c) => c.kind === 'folder' && c.name === seg) ?? node;
    return node.children.map((c) => c.name);
  }

  $effect(() => { if (action.kind === 'new-page' && !nameTouched) name = title.trim() ? suggestFileName(title, siblings) : ''; });
  $effect(() => {
    if (action.kind === 'rename' && name && !problem) {
      const to = [...action.path.split('/').slice(0, -1), name].join('/');
      void app.readAll(action.cid).then(({ docs, skipped: sk }) => { skipped = sk; preview = planRename(texts(docs), action.path, to).map((p) => ({ path: p.path, count: p.count })); });
    }
    if (action.kind === 'delete') void app.readAll(action.cid).then(({ docs, skipped: sk }) => { skipped = sk; preview = inboundLinks(texts(docs), [action.path]); });
  });

  const texts = (docs: Map<string, { text: string }>) => new Map([...docs].map(([p, d]) => [p, d.text]));
  const inside = $derived.by(() => {
    if (action.kind !== 'delete' || !action.isFolder) return [];
    return app.filesFor(action.cid).filter((f) => f.startsWith(action.path + '/'));
  });
  const close = () => (app.fileAction = null);
  async function confirm() {
    if (busy) return;
    busy = true;
    try {
      if (action.kind === 'new-page') await app.createPage(action.cid, action.folder, title.trim() || name.replace(/\.(md|markdown|txt)$/i, ''), name);
      if (action.kind === 'new-folder') await app.createFolder(action.cid, action.folder, name);
      if (action.kind === 'rename' && !(await app.renameEntry(action.cid, action.path, name))) return;
      if (action.kind === 'delete' && !(await app.deleteEntry(action.cid, action.path))) return;
      close();
    } finally { busy = false; }
  }
  const links = $derived(preview?.reduce((n, p) => n + p.count, 0) ?? 0);
  const heading = $derived({ 'new-page': 'New page', 'new-folder': 'New folder', rename: 'Rename', delete: 'Move to the Recycle Bin' }[action.kind]);
  const verb = $derived({ 'new-page': 'Create', 'new-folder': 'Create', rename: 'Rename', delete: 'Move to the Recycle Bin' }[action.kind]);
</script>

<Dialog title={heading} onclose={close}>
  {#if action.kind === 'new-page'}
    <label>Title <input data-autofocus bind:value={title} /></label>
  {/if}
  {#if action.kind !== 'delete'}
    <label>File name <input data-autofocus={action.kind !== 'new-page' ? true : undefined} bind:value={name} oninput={() => (nameTouched = true)} aria-describedby="name-problem" /></label>
    <p id="name-problem" class="muted small" role="status">{problem && name ? NAME_MESSAGES[problem] : ''}</p>
  {/if}
  {#if action.kind === 'rename' && preview}
    <p>{links ? `${links} link${links === 1 ? '' : 's'} in ${preview.length} page${preview.length === 1 ? '' : 's'} will be updated.` : 'No other pages link here.'}</p>
    <ul class="small">{#each preview as p (p.path)}<li>{friendlyName(p.path)} ({p.count})</li>{/each}</ul>
  {/if}
  {#if action.kind === 'rename' && skipped.length}<p class="small">These pages couldn't be read and won't be updated: {skipped.map(friendlyName).join(', ')}</p>{/if}
  {#if action.kind === 'delete'}
    <p>“{friendlyName(action.path)}” {action.isFolder ? 'and everything in it ' : ''}will go to the Recycle Bin.</p>
    {#if inside.length}
      <ul class="small">{#each inside.slice(0, 20) as f (f)}<li>{friendlyName(f)}</li>{/each}</ul>
      {#if inside.length > 20}<p class="small">and {inside.length - 20} more</p>{/if}
    {/if}
    {#if skipped.length}<p class="small">These pages couldn't be read, so links from them aren't counted: {skipped.map(friendlyName).join(', ')}</p>{/if}
    {#if preview?.length}<p>{links} link{links === 1 ? '' : 's'} in {preview.length} page{preview.length === 1 ? '' : 's'} will break.</p>{/if}
  {/if}
  {#snippet actions()}
    <button class="btn" onclick={close}>Cancel</button>
    <button class={action.kind === 'delete' ? 'btn btn-danger' : 'btn btn-primary'} disabled={busy || (action.kind !== 'delete' && !!problem)} onclick={confirm}>{verb}</button>
  {/snippet}
</Dialog>
