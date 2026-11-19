<script lang="ts">
  import Dialog from './Dialog.svelte';
  import { app } from './state/app.svelte';

  let { target, collectionId }: { target: string; collectionId: string } = $props();
  const folder = $derived(app.collections.find((c) => c.id === collectionId)?.name ?? '');
  const close = () => (app.brokenLink = null);
</script>

<Dialog title="This page can’t be found" onclose={close}>
  <p>The link points to <strong>{target}</strong>, but there’s no page with that name in “{folder}”.</p>
  <p>The page may have been renamed, moved, or not written yet. Your other documents are not affected.</p>
  {#snippet actions()}
    <button class="btn" onclick={() => app.searchSimilar()}>Search for similar pages</button>
    <button class="btn btn-primary" onclick={close}>OK</button>
  {/snippet}
</Dialog>
