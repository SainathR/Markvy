<script lang="ts">
  import { app } from './state/app.svelte';

  let el = $state<HTMLElement>();

  function down(e: PointerEvent) {
    if (e.button !== 0 || !el?.parentElement) return;
    el.setPointerCapture(e.pointerId);
    const box = el.parentElement.getBoundingClientRect();
    const move = (ev: PointerEvent) => app.setRatio((ev.clientX - box.left) / box.width);
    const up = (ev: PointerEvent) => {
      el?.removeEventListener('pointermove', move);
      el?.removeEventListener('pointerup', up);
      el?.removeEventListener('pointercancel', up);
      if (el?.hasPointerCapture(ev.pointerId)) el.releasePointerCapture(ev.pointerId);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  function key(e: KeyboardEvent) {
    const step = e.key === 'ArrowLeft' ? -0.05 : e.key === 'ArrowRight' ? 0.05 : 0;
    if (!step) return;
    e.preventDefault();
    app.setRatio(app.ws.ratio + step);
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div class="divider" role="separator" aria-orientation="vertical" aria-label="Resize the two reading panes"
  aria-valuemin={25} aria-valuemax={75} aria-valuenow={Math.round(app.ws.ratio * 100)} tabindex="0"
  title="Drag to resize. Double-click to reset." bind:this={el} onpointerdown={down} onkeydown={key} ondblclick={() => app.setRatio(0.5)}></div>
