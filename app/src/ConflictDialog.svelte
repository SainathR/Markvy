<script lang="ts">
  import Dialog from './Dialog.svelte';
  import { parseKey } from './lib/library';
  import type { EditSession } from './state/edit.svelte';
  import { app } from './state/app.svelte';

  let { session, onclose }: { session: EditSession; onclose: () => void } = $props();
  const c = $derived(session.conflict!);
  let showBoth = $state(false);
  let busy = $state(false);
  const siblings = $derived.by(() => {
    const { collectionId, path } = parseKey(session.key);
    const folder = path.split('/').slice(0, -1).join('/');
    return app.filesFor(collectionId).filter((p) => p.split('/').slice(0, -1).join('/') === folder).map((p) => p.split('/').pop()!);
  });

  async function choose(choice: 'combine' | 'mine' | 'theirs' | 'copy') {
    busy = true;
    try {
      await session.resolve(choice, siblings);
    } catch (e) {
      app.report(e);
    } finally {
      busy = false;
    }
  }
</script>

<Dialog title="This page changed while you were editing" wide {onclose}>
  {#if c.merged.kind === 'clean'}
    <p>Someone else changed other parts of this page. Markvy can combine both sets of changes.</p>
    <button class="link-btn" aria-expanded={showBoth} onclick={() => (showBoth = !showBoth)}>{showBoth ? 'Hide both versions' : 'Show both'}</button>
    {#if showBoth}<div class="clash"><div><h3>Yours</h3><pre>{session.text}</pre></div><div><h3>On disk now</h3><pre>{c.theirs}</pre></div></div>{/if}
  {:else}
    <p>The same part of the page was changed in two places. Choose which version to keep.</p>
    {#each c.merged.clashes as clash, i (i)}
      <div class="clash"><div><h3>Yours</h3><pre>{clash.mine}</pre></div><div><h3>On disk now</h3><pre>{clash.theirs}</pre></div></div>
    {/each}
  {/if}
  {#snippet actions()}
    <button class="btn" disabled={busy} onclick={() => choose('copy')}>Save mine as a copy</button>
    <button class="btn" disabled={busy} onclick={() => choose('theirs')}>Keep theirs</button>
    <button class="btn" disabled={busy} onclick={() => choose('mine')}>Keep mine</button>
    {#if c.merged.kind === 'clean'}<button class="btn btn-primary" disabled={busy} data-autofocus onclick={() => choose('combine')}>Combine both</button>{/if}
  {/snippet}
</Dialog>
