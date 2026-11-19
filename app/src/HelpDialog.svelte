<script lang="ts">
  import Dialog from './Dialog.svelte';
  import Icon from './Icon.svelte';
  import { app } from './state/app.svelte';

  const TITLES = { home: 'Getting started', reader: 'Reading documents', search: 'Searching', library: 'Your library', prefs: 'Reading preferences', help: 'Privacy and help' } as const;
  const view = app.view; // the screen the reader asked about, fixed while the dialog is open
  const close = () => (app.helpOpen = false);
  function allTopics() {
    close();
    app.view = 'help';
  }
</script>

<Dialog title={TITLES[view]} onclose={close}>
  {#if view === 'home'}
    <p>Choose how to begin:</p>
    <ul>
      <li><strong>Open a document</strong> reads one file from your computer; its folder opens too.</li>
      <li><strong>Open a folder</strong> lets you browse a whole collection of linked pages.</li>
      <li><strong>Explore the sample library</strong> opens a small example handbook.</li>
    </ul>
    <p><strong>Restore previous session</strong> reopens the tabs you had last time. <strong>Start fresh</strong> closes them.</p>
  {:else if view === 'search'}
    <ul>
      <li>Type a word or phrase and press <kbd>Enter</kbd> or select <strong>Search</strong>.</li>
      <li>Choose <strong>where to search</strong>: everywhere, the folder you’re in, or only the document you’re reading.</li>
      <li>Results show matching sections. “Heading match” means the words appear in a section title.</li>
      <li>Select a result to jump straight to that section, with matches highlighted. Use the arrows in the bar above the page to move between matches.</li>
    </ul>
  {:else if view === 'library'}
    <ul>
      <li><strong>Recent</strong>: documents you opened, newest first.</li>
      <li><strong>Favorites</strong>: documents you starred.</li>
      <li><strong>Bookmarks</strong>: individual sections you saved.</li>
      <li><strong>Reading progress</strong>: how far you’ve read each document.</li>
      <li><strong>Search history</strong>: what you searched for.</li>
    </ul>
    <p>Use the filter and sort controls to find things quickly.</p>
  {:else if view === 'prefs'}
    <p>Every change is shown immediately in the preview and in your documents. Settings are remembered on this computer. Use <strong>Restore default settings</strong> to undo them.</p>
  {:else if view === 'help'}
    <p>This page explains how Markvy protects your documents, lets you choose how links and pictures from the internet are handled, and lists the keyboard shortcuts.</p>
  {:else}
    <ul>
      <li>The <strong>left panel</strong> lists folders and documents. Select one to open it in a tab.</li>
      <li>The <strong>right panel</strong> lists the sections of the page. The one you’re reading is highlighted.</li>
      <li><strong>Links</strong> to other pages open in the same tab. Use Back to return. Hold <kbd>Ctrl</kbd> to open a new tab, or <kbd>Shift</kbd> to open it beside this one.</li>
      <li>A link in <span style="color:var(--danger)">red with a dotted underline</span> points to a missing page.</li>
      <li>A link with <Icon name="external" /> opens a website in your browser.</li>
      <li>The bar under the toolbar shows how far you’ve read.</li>
    </ul>
  {/if}
  {#snippet actions()}
    <button class="btn" onclick={allTopics}>All help topics</button>
    <button class="btn btn-primary" onclick={close}>Close</button>
  {/snippet}
</Dialog>
