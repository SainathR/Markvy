<script lang="ts">
  import { t } from './lib/i18n';
  import { LIMITS, type FontId, type Lang } from './lib/prefs';
  import { app } from './state/app.svelte';
  import ThemeSwatches from './ThemeSwatches.svelte';

  const prefs = $derived(app.library.prefs);
  const lang = $derived(prefs.lang);
  const widthLabel = $derived(prefs.width < 60 ? `Narrow (${prefs.width})` : prefs.width > 80 ? `Wide (${prefs.width})` : `Medium (${prefs.width})`);
  const num = (e: Event) => Number((e.currentTarget as HTMLInputElement).value);
</script>

<section class="view" aria-labelledby="prefs-h">
  <div class="view-inner wide">
    <h1 class="vt" id="prefs-h" tabindex="-1">{t(lang, 'prefsTitle')}</h1>
    <p class="lede">Changes apply straight away and are remembered on this computer.</p>
    <div class="prefs-grid">
      <form class="prefs" onsubmit={(e) => e.preventDefault()}>
        <fieldset>
          <legend>Colour theme</legend>
          <ThemeSwatches mode="radios" />
          <p class="hint">Automatic follows your computer: Paper by day, Night when it's set to dark. High contrast, below, replaces any theme's colours.</p>
        </fieldset>
        <div class="field">
          <label for="p-font">Reading font</label>
          <select id="p-font" value={prefs.font} onchange={(e) => app.setPref('font', (e.currentTarget as HTMLSelectElement).value as FontId)}>
            <option value="serif">Book serif (Literata)</option>
            <option value="sans">Clean sans-serif (Figtree)</option>
            <option value="easy">Easier-reading font (Lexend)</option>
          </select>
          <p class="hint">Lexend has wider letter shapes and spacing. Many readers with dyslexia find it easier to read.</p>
        </div>
        <div class="field"><label for="p-size">Text size</label><div class="range-row"><input type="range" id="p-size" min={LIMITS.fontSize[0]} max={LIMITS.fontSize[1]} step="1" value={prefs.fontSize} oninput={(e) => app.setPref('fontSize', num(e))} /><output for="p-size">{prefs.fontSize} px</output></div></div>
        <div class="field"><label for="p-width">Reading width</label><div class="range-row"><input type="range" id="p-width" min={LIMITS.width[0]} max={LIMITS.width[1]} step="1" value={prefs.width} oninput={(e) => app.setPref('width', num(e))} /><output for="p-width">{widthLabel}</output></div><p class="hint">Narrower lines are easier to follow. Wider lines fit more on screen.</p></div>
        <div class="field"><label for="p-lh">Line spacing</label><div class="range-row"><input type="range" id="p-lh" min={LIMITS.lineHeight[0]} max={LIMITS.lineHeight[1]} step="0.05" value={prefs.lineHeight} oninput={(e) => app.setPref('lineHeight', num(e))} /><output for="p-lh">{prefs.lineHeight.toFixed(2)}×</output></div></div>
        <div class="field"><label for="p-zoom">Interface zoom</label><div class="range-row"><input type="range" id="p-zoom" min={LIMITS.zoom[0]} max={LIMITS.zoom[1]} step="10" value={prefs.zoom} oninput={(e) => app.setPref('zoom', num(e))} /><output for="p-zoom">{prefs.zoom}%</output></div><p class="hint">Makes menus, buttons and text larger or smaller together.</p></div>
        <label class="switch"><input type="checkbox" checked={prefs.contrast} onchange={(e) => app.setPref('contrast', (e.currentTarget as HTMLInputElement).checked)} /><span><strong>High contrast</strong><span>Black and white with strong outlines.</span></span></label>
        <label class="switch"><input type="checkbox" checked={prefs.reduceMotion} onchange={(e) => app.setPref('reduceMotion', (e.currentTarget as HTMLInputElement).checked)} /><span><strong>Reduce motion</strong><span>Turns off scrolling and sliding animations. Your computer's own setting is always respected.</span></span></label>
        <label class="switch"><input type="checkbox" checked={prefs.allowEditing} onchange={(e) => { const box = e.currentTarget as HTMLInputElement; void app.setAllowEditing(box.checked).then((ok) => { if (!ok) box.checked = true; }); }} /><span><strong>Allow editing</strong><span>Show Edit, New page, Rename and Delete. Turn off to make Markvy read-only again.</span></span></label>
        <div class="field">
          <label for="p-lang">Interface language</label>
          <select id="p-lang" value={prefs.lang} onchange={(e) => app.setPref('lang', (e.currentTarget as HTMLSelectElement).value as Lang)}>
            <option value="en">English</option><option value="es">Español</option><option value="de">Deutsch</option>
          </select>
          <p class="hint">Only the main menus and headings are translated so far. Your documents are never translated.</p>
        </div>
        <div><button class="btn" type="button" onclick={() => app.resetPrefs()}>Restore default settings</button></div>
      </form>
      <div class="preview-box" role="group" aria-label="Preview of your reading settings">
        <p class="eyebrow">Preview</p>
        <div class="doc" aria-hidden="true">
          <h2>Public computers</h2>
          <p>There are 12 computers on the first floor. Patrons sign in with their library card number and get <strong>two hours</strong> per day. Sessions can be extended if nobody is waiting.</p>
          <p>Printing costs 10 cents per black-and-white page. Jobs wait in the print queue for 30 minutes before they're deleted.</p>
        </div>
      </div>
    </div>
  </div>
</section>
