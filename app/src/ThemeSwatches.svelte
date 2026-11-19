<script lang="ts">
  import { THEMES } from './lib/prefs';
  import { app } from './state/app.svelte';

  let { mode }: { mode: 'buttons' | 'radios' } = $props();
  const selected = $derived(app.library.prefs.theme);
</script>

<div class="swatches" role={mode === 'buttons' ? 'group' : 'radiogroup'} aria-label="Colour theme">
  {#each THEMES as theme (theme.id)}
    {#if mode === 'buttons'}
      <button class="swatch" aria-pressed={selected === theme.id} onclick={() => app.setPref('theme', theme.id)}>
        <span class="sw-chip" style="--b:{theme.preview.page};--c:{theme.preview.text};--a:{theme.preview.accent}" aria-hidden="true"></span>{theme.name}
      </button>
    {:else}
      <label class="swatch">
        <input type="radio" name="theme" value={theme.id} checked={selected === theme.id} onchange={() => app.setPref('theme', theme.id)} />
        <span class="sw-chip" style="--b:{theme.preview.page};--c:{theme.preview.text};--a:{theme.preview.accent}" aria-hidden="true"></span>{theme.name}
      </label>
    {/if}
  {/each}
</div>
