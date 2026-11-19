<script lang="ts">
  import Dialog from './Dialog.svelte';
  import { hostOf } from './lib/remote';
  import { app } from './state/app.svelte';

  let { url }: { url: string } = $props();
  const host = $derived(hostOf(url) || url);
  const keep = () => (app.imageReview = null);
</script>

<Dialog title="Show a picture from the internet?" onclose={keep}>
  <p>This picture is stored on <strong>{host}</strong>, not with your documents.</p>
  <p>To show it, Markvy would download it from that website. The website could then see your network address and when you opened this page.</p>
  <p class="url-box">{url}</p>
  {#snippet actions()}
    <button class="btn" onclick={keep}>Keep hidden</button>
    <button class="btn" onclick={() => app.showImage(true)}>Always show pictures from {host}</button>
    <button class="btn btn-primary" onclick={() => app.showImage(false)}>Show this picture</button>
  {/snippet}
</Dialog>
