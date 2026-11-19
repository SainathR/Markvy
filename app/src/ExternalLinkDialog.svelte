<script lang="ts">
  import Dialog from './Dialog.svelte';
  import { app } from './state/app.svelte';

  let { url }: { url: string } = $props();
  let dontAsk = $state(false);
  const isMail = $derived(/^mailto:/i.test(url));
  // What is actually opened: for websites the normalised address (punycode shows a look-alike host); the raw text if it can't be read.
  const shown = $derived.by(() => {
    if (isMail) return url;
    try { return new URL(url).href; } catch { return url; }
  });
  const cancel = () => (app.externalUrl = null);
</script>

<Dialog title={isMail ? 'Write an email?' : 'Open this website?'} onclose={cancel}>
  <p>This link leads outside your documents to:</p>
  <p class="url-box">{shown}</p>
  <p>{isMail ? 'It will open in your usual email app.' : 'It will open in your usual web browser. Markvy doesn’t open the page itself.'}</p>
  <p><label class="check"><input type="checkbox" bind:checked={dontAsk} /> Don’t ask again</label></p>
  {#snippet actions()}
    <button class="btn" data-autofocus onclick={cancel}>Cancel</button>
    <button class="btn btn-primary" onclick={() => app.openExternal(url, dontAsk)}>{isMail ? 'Open email app' : 'Open in browser'}</button>
  {/snippet}
</Dialog>
