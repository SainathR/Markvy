<script lang="ts">
  import { onMount, type Snippet } from 'svelte';

  let { title, wide = false, onclose, children, actions }: { title: string; wide?: boolean; onclose: () => void; children: Snippet; actions: Snippet } = $props();
  let dialog = $state<HTMLDialogElement>();
  // Focus goes back to whatever opened the dialog.
  const opener = document.activeElement as HTMLElement | null;

  onMount(() => {
    dialog?.showModal();
    dialog?.querySelector<HTMLElement>('[data-autofocus]')?.focus(); // else the browser picks the first control
    return () => opener?.focus();
  });
</script>

<dialog bind:this={dialog} class:wide aria-labelledby="dlg-title" {onclose}>
  <div class="dlg-head"><h2 id="dlg-title">{title}</h2></div>
  <div class="dlg-body">{@render children()}</div>
  <div class="dlg-actions">{@render actions()}</div>
</dialog>
