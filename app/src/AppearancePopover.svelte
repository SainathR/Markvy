<script lang="ts">
  import { LIMITS } from './lib/prefs';
  import { app } from './state/app.svelte';
  import ThemeSwatches from './ThemeSwatches.svelte';

  let { onclose }: { onclose: (opts?: { restoreFocus: boolean }) => void } = $props();
  let box = $state<HTMLElement>();
  const size = $derived(app.library.prefs.fontSize);

  // Opening moves focus to the first swatch.
  $effect(() => {
    box?.querySelector('button')?.focus();
  });

  $effect(() => {
    const down = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (box && !box.contains(target) && !target.closest('[aria-controls="appearance-pop"]')) onclose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onclose({ restoreFocus: true });
    };
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('keydown', key);
    };
  });
</script>

<div class="popover" id="appearance-pop" role="dialog" aria-label="Appearance" bind:this={box}>
  <h2>Colour theme</h2>
  <ThemeSwatches mode="buttons" />
  <h2>Text size</h2>
  <div class="size-row">
    <button class="btn sm" aria-label="Smaller text" aria-disabled={size <= LIMITS.fontSize[0]} onclick={() => { if (size > LIMITS.fontSize[0]) app.setPref('fontSize', size - 1); }}>A−</button>
    <output aria-live="polite">{size} px</output>
    <button class="btn sm" aria-label="Larger text" aria-disabled={size >= LIMITS.fontSize[1]} onclick={() => { if (size < LIMITS.fontSize[1]) app.setPref('fontSize', size + 1); }}>A+</button>
  </div>
  <button class="link-btn" onclick={() => { app.view = 'prefs'; onclose(); }}>All reading preferences</button>
</div>
