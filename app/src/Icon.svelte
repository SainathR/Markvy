<script lang="ts">
  let { name, cls = '' }: { name: string; cls?: string } = $props();
</script>

<svg class="i {cls}" aria-hidden="true"><use href="#i-{name}" /></svg>
