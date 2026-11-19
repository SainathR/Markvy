<script lang="ts">
  import { highlight } from './lib/search';

  let { text, q, whole }: { text: string; q: string; whole: boolean } = $props();
</script>

{#each highlight(text, q, whole) as s, i (i)}{#if s.hit}<mark>{s.text}</mark>{:else}{s.text}{/if}{/each}
