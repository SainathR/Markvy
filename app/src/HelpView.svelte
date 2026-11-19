<script lang="ts">
  import Dialog from './Dialog.svelte';
  import Icon from './Icon.svelte';
  import { t } from './lib/i18n';
  import { app } from './state/app.svelte';

  const lang = $derived(app.library.prefs.lang);
  let confirming = $state<'history' | 'reset' | null>(null);
  const sampleOpen = $derived(app.collections.some((c) => c.id === 'sample' && c.available));

  function setLinks(v: 'ask' | 'direct') {
    app.setPref('extLinks', v);
    app.notice = 'Link setting saved.';
  }
  function setPictures(v: 'ask' | 'block') {
    app.setPref('remoteImages', v);
    app.notice = 'Picture setting saved.';
  }
</script>

<section class="view" id="view-help" aria-labelledby="help-h">
  <div class="view-inner wide">
    <h1 class="vt" id="help-h" tabindex="-1">{t(lang, 'helpTitle')}</h1>
    <p class="lede">How Markvy handles your documents, links and pictures from the internet, and how to get help.</p>
    <div class="help-grid">
      <div class="promise"><h3><Icon name="lock" />Your files stay yours</h3><p>Markvy changes your files only when you press Save, rename or delete. Unsaved changes are kept in Markvy's own folder on this computer and are never sent anywhere.</p></div>
      <div class="promise"><h3><Icon name="upload-off" />Nothing is uploaded</h3><p>Your documents are read on this computer and never sent anywhere. The only thing Markvy fetches from the internet is a picture you chose to show.</p></div>
      <div class="promise"><h3><Icon name="eye-off" />No usage tracking</h3><p>Markvy has no analytics, crash reporting or update checks.</p></div>
      <div class="promise"><h3><Icon name="offline" />Works offline</h3><p>Reading, searching and navigating don't need an internet connection. Fonts and display tools are built in.</p></div>
    </div>

    <section class="help-section" aria-labelledby="ext-h">
      <h2 id="ext-h">Links to websites</h2>
      <p>Links to websites and email addresses open in your usual browser or email app, never inside Markvy. That keeps websites separate from your documents.</p>
      <div class="radio-list" role="radiogroup" aria-labelledby="ext-h">
        <label><input type="radio" name="ext" checked={app.library.prefs.extLinks === 'ask'} onchange={() => setLinks('ask')} /><span>Ask before opening a website <small>Shows the full address first so you can check it. Recommended.</small></span></label>
        <label><input type="radio" name="ext" checked={app.library.prefs.extLinks === 'direct'} onchange={() => setLinks('direct')} /><span>Open websites straight away <small>Skips the question.</small></span></label>
      </div>
    </section>

    <section class="help-section" aria-labelledby="img-h">
      <h2 id="img-h">Pictures from the internet</h2>
      <p>Some documents include pictures stored on other websites. Loading one tells that website that you're reading, and when. Markvy hides these pictures until you say otherwise.</p>
      <div class="radio-list" role="radiogroup" aria-labelledby="img-h">
        <label><input type="radio" name="remote" checked={app.library.prefs.remoteImages === 'ask'} onchange={() => setPictures('ask')} /><span>Ask each time <small>A placeholder shows where the picture is. Choose to show it if you trust the source.</small></span></label>
        <label><input type="radio" name="remote" checked={app.library.prefs.remoteImages === 'block'} onchange={() => setPictures('block')} /><span>Never show pictures from the internet <small>Pictures stored with your documents still appear.</small></span></label>
      </div>
      {#if app.library.allowedImageSites.length}
        <h3 class="section-h">Sites whose pictures always show</h3>
        <ul class="rows">
          {#each app.library.allowedImageSites as host (host)}
            <li><span class="row-main"><span class="row-title">{host}</span></span><button class="btn sm" aria-label="Stop always showing pictures from {host}" onclick={() => app.forbidSite(host)}>Remove</button></li>
          {/each}
        </ul>
      {/if}
      {#if sampleOpen}<div class="btn-row"><button class="btn sm" onclick={() => app.open('sample/Guides/Introduction.md')}>See an example</button></div>{/if}
    </section>

    <section class="help-section" aria-labelledby="hist-h">
      <h2 id="hist-h">History and reset</h2>
      <p>Markvy remembers recent documents, searches, reading progress, favorites, bookmarks and your open tabs on this computer only, in its own settings file.</p>
      <div class="btn-row">
        <button class="btn" onclick={() => (confirming = 'history')}><Icon name="clock" />Clear history</button>
        <button class="btn" onclick={() => (confirming = 'reset')}><Icon name="restore" />Reset workspace</button>
      </div>
    </section>

    <section class="help-section" aria-labelledby="enf-h">
      <h2 id="enf-h">What Markvy enforces</h2>
      <ul>
        <li>The window that shows your documents has no permission to read or write files. Everything it reads comes through Markvy, and only from the folders you opened.</li>
        <li>Markvy writes to your documents only when you press Save, rename or delete, and only inside folders you opened. Its own settings, log, unsaved drafts and the display window's cache are kept in Markvy's own data folders.</li>
        <li>Every document Markvy reads must be inside a folder you opened. Links that point elsewhere are refused.</li>
        <li>Documents can't run scripts, load web pages or send anything: formatting is cleaned before display, and a strict content security policy applies.</li>
        <li>Pictures from the internet load only after you allow them, and only through one part of Markvy that accepts nothing but pictures of up to 5 MB.</li>
        <li>Only web and email links leave Markvy, and they open in your browser or email app.</li>
      </ul>
      <p>One limitation: the questions before opening a website or showing a picture from the internet are asked by the window that shows documents. If a flaw ever let a document get past the cleaning and the content security policy, it could make Markvy contact a website, or open one in your browser, without asking you. No independent review of these protections has been done yet.</p>
    </section>

    <section class="help-section" aria-labelledby="log-h">
      <h2 id="log-h">If something goes wrong</h2>
      <p>Markvy keeps a log of technical details about problems, on this computer only. It never contains the text of your documents. When a message offers <strong>Copy details</strong>, the same details go to the clipboard so you can pass them on.</p>
      <div class="btn-row"><button class="btn" onclick={() => app.openLogFolder()}><Icon name="folder-open" />Open log folder</button></div>
    </section>

    <section class="help-section" aria-labelledby="keys-h">
      <h2 id="keys-h">Keyboard shortcuts</h2>
      <dl class="shortcuts">
        <dt><kbd>/</kbd> or <kbd>Ctrl</kbd> + <kbd>K</kbd></dt><dd>Search</dd>
        <dt><kbd>Alt</kbd> + <kbd>←</kbd> / <kbd>→</kbd></dt><dd>Back and forward in the current tab</dd>
        <dt><kbd>[</kbd> and <kbd>]</kbd></dt><dd>Show or hide the library panel and the contents panel</dd>
        <dt><kbd>\</kbd></dt><dd>Read side by side, or go back to one page</dd>
        <dt><kbd>Ctrl</kbd> + click a link</dt><dd>Open the page in a new tab</dd>
        <dt><kbd>Shift</kbd> + click a link</dt><dd>Open the page beside the current one</dd>
        <dt><kbd>←</kbd> / <kbd>→</kbd> on a tab</dt><dd>Move between open tabs</dd>
        <dt><kbd>Esc</kbd></dt><dd>Close a dialog, menu or search highlights</dd>
      </dl>
    </section>

    <section class="help-section faq" aria-labelledby="faq-h">
      <h2 id="faq-h">Common questions</h2>
      <details><summary>What kind of documents can Markvy open?</summary><p>Plain-text documents written in Markdown, a simple way of adding headings, lists and links to text. Their names usually end in .md. You don't need to know Markdown to read them; Markvy shows them formatted.</p></details>
      <details><summary>Why is a link shown in red with a dotted underline?</summary><p>It points to a page that isn't in this folder. The page may have been renamed, moved or not written yet. Selecting it explains what's missing.</p></details>
      <details><summary>Why does Markvy ask before showing some pictures?</summary><p>Those pictures are stored on other websites. Showing them would tell those websites that you're reading the document. You decide whether that's acceptable.</p></details>
      <details><summary>Editing a page</summary><p>Select <strong>Edit this page</strong> above a page. The page opens like a Word document, with a toolbar for headings, lists, links, tables and pictures. Press <kbd>Ctrl</kbd> + <kbd>S</kbd> or <strong>Save</strong> to write your changes, and <strong>Done</strong> to go back to reading. Turn editing off in Reading preferences to make Markvy read-only again.</p></details>
      <details><summary>Unsaved changes and drafts</summary><p>While you edit, Markvy keeps a draft in its own folder on this computer. It is never sent anywhere. If Markvy closes before you save, the draft is offered the next time you open the page. Your file itself is not changed until you press Save.</p></details>
      <details><summary>When a page changed while you were editing</summary><p>If another program changes the file, Markvy tells you and does not overwrite it. You can reload the new version, or keep your text and choose what to do with it.</p></details>
      <details><summary>New, rename and delete</summary><p>Use New page and New folder at the top of the library panel, and the menu on a page to rename or delete it. Renaming shows which links in other pages will be updated first. Deleting moves the page to the Recycle Bin.</p></details>
      <details><summary>Where are my favorites and bookmarks stored?</summary><p>On this computer only, in Markvy's own settings file. Use “Clear history” or “Reset workspace” above to remove them yourself.</p></details>
    </section>
  </div>
</section>

{#if confirming === 'history'}
  <Dialog title="Clear history?" onclose={() => (confirming = null)}>
    <p>This removes recent documents, recent searches and reading progress from this computer. Favorites, bookmarks and settings are kept.</p>
    <p>Your documents are not affected.</p>
    {#snippet actions()}
      <button class="btn" onclick={() => (confirming = null)}>Cancel</button>
      <button class="btn btn-primary" onclick={() => { app.clearHistory(); confirming = null; }}>Clear history</button>
    {/snippet}
  </Dialog>
{:else if confirming === 'reset'}
  <Dialog title="Reset the workspace?" onclose={() => (confirming = null)}>
    <p>This closes all tabs and removes favorites, bookmarks, history, allowed picture sites and settings from this computer. Your folders stay in the list.</p>
    <p>Your documents are not affected. This can't be undone.</p>
    {#snippet actions()}
      <button class="btn" onclick={() => (confirming = null)}>Cancel</button>
      <button class="btn btn-primary" onclick={() => { app.resetWorkspace(); confirming = null; }}>Reset workspace</button>
    {/snippet}
  </Dialog>
{/if}
