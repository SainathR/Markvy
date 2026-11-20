<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { editorViewCtx } from '@milkdown/kit/core';
  import { redoCommand, undoCommand } from '@milkdown/kit/plugin/history';
  import { createCodeBlockCommand, toggleEmphasisCommand, toggleInlineCodeCommand, toggleStrongCommand, wrapInBlockquoteCommand, wrapInBulletListCommand, wrapInHeadingCommand, wrapInOrderedListCommand } from '@milkdown/kit/preset/commonmark';
  import { addColAfterCommand, addRowAfterCommand, deleteSelectedCellsCommand, insertTableCommand, toggleStrikethroughCommand } from '@milkdown/kit/preset/gfm';
  import type { Node as PMNode } from '@milkdown/kit/prose/model';
  import { EditorState, Selection, TextSelection } from '@milkdown/kit/prose/state';
  import type { EditorView } from '@milkdown/kit/prose/view';
  import { callCommand } from '@milkdown/kit/utils';
  import ConflictDialog from './ConflictDialog.svelte';
  import Dialog from './Dialog.svelte';
  import Icon from './Icon.svelte';
  import { MESSAGES } from './lib/core';
  import { splitBlocks } from './lib/editor/blocks';
  import { addWebLink as linkTo, createCodec, type Codec } from './lib/editor/codec';
  import { load, toMarkdown, type Loaded } from './lib/editor/model';
  import { detectStyle } from './lib/editor/style';
  import { parseKey } from './lib/library';
  import { resolvePath, safeDecode } from './lib/markdown/links';
  import { renderDocument } from './lib/markdown/render';
  import { observeDiagrams } from './lib/mermaid';
  import type { EditSession } from './state/edit.svelte';
  import { app, assetUrl } from './state/app.svelte';

  let { docKey: key, session }: { docKey: string; session: EditSession } = $props();
  let host = $state<HTMLElement>();
  let codec: Codec | null = null;
  let view: EditorView | null = null;
  let loaded: Loaded | null = null;
  let shownText = ''; // the text the editor holds; anything else in session.text came from a conflict choice
  let destroyed = false;
  let sourceEdit = $state<{ pos: number } | null>(null);
  let sourceText = $state('');
  let leaving = $state(false);
  let confirmDiscard = $state(false);
  let conflictHidden = $state(false);
  const loc = $derived(parseKey(key));
  const PICTURE = /^image\/(png|jpeg|gif|webp)$/;
  const MAX_PICTURE = 20 * 1024 * 1024;

  const run = (cmd: Parameters<typeof callCommand>[0], payload?: unknown) => codec?.editor.action(callCommand(cmd, payload));

  /** Shows `text` in the editor; the state holds loaded.doc itself, so every untouched block is the very node `load` recorded. */
  function show(text: string) {
    if (!codec || !view) return;
    loaded = load(text, codec);
    shownText = text;
    // The caret starts in the first text: a selected card (front matter comes first) would be replaced by the first key typed.
    const selection = Selection.findFrom(loaded.doc.resolve(0), 1, true) ?? undefined;
    view.updateState(EditorState.create({ doc: loaded.doc, selection, plugins: view.state.plugins }));
  }

  onMount(async () => {
    let c: Codec;
    try {
      c = await createCodec(host!, detectStyle(splitBlocks(session.baseText).blocks));
    } catch (e) {
      app.report(e);
      return;
    }
    if (destroyed) { c.destroy(); return; }
    codec = c;
    view = c.editor.ctx.get(editorViewCtx);
    const v = view;
    v.setProps({
      dispatchTransaction(tr) {
        v.updateState(v.state.apply(tr));
        if (tr.docChanged && loaded) {
          shownText = toMarkdown(v.state.doc, loaded, c);
          session.change(shownText);
        }
      },
      handlePaste(_v, event) {
        const data = event.clipboardData;
        // Text from Word or a web page often carries a picture of itself too: the text wins.
        if (!data?.files.length || data.types.includes('text/plain')) return false;
        void addPicture(data.files[0]);
        return true;
      },
      handleDrop(_v, event) {
        const files = (event as DragEvent).dataTransfer?.files;
        if (!files?.length) return false;
        const at = v.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        void addPicture(files[0], at);
        return true;
      },
      nodeViews: {
        markvy_card: (node, _v, getPos) => cardView(node, () => getPos() ?? 0),
        image: (node) => ({ dom: pictureView(node) }),
      },
    });
    show(session.text);
  });

  // A conflict choice (keep theirs, combine, save a copy) replaces the text: show it.
  $effect(() => {
    const text = session.text;
    if (text !== shownText) show(text);
  });

  // Each new conflict opens the dialog again.
  $effect(() => {
    if (session.state !== 'conflict') conflictHidden = false;
  });

  onDestroy(() => {
    destroyed = true;
    codec?.destroy();
  });

  function cardView(node: PMNode, pos: () => number) {
    const raw = String(node.attrs.raw);
    const dom = document.createElement('div');
    dom.className = 'ed-card';
    dom.dataset.kind = String(node.attrs.kind);
    let stop = () => {};
    if (node.attrs.kind === 'frontmatter') {
      const pre = document.createElement('pre');
      pre.textContent = raw;
      dom.append(pre);
    } else {
      const { article } = renderDocument(raw, { collectionId: loc.collectionId, path: loc.path, files: app.filesFor(loc.collectionId), assetUrl, remoteImages: app.library.prefs.remoteImages });
      dom.append(article);
      stop = observeDiagrams(article, app.dark);
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn sm';
    btn.textContent = 'Edit source';
    btn.onclick = () => { sourceText = raw; sourceEdit = { pos: pos() }; };
    dom.append(btn);
    return { dom, stopEvent: () => true, ignoreMutation: () => true, destroy: () => stop() };
  }

  /** Pictures in the folder show from disk; pictures from the internet are never loaded here (the reader asks first). */
  function pictureView(node: PMNode) {
    const src = String(node.attrs.src ?? '');
    const alt = String(node.attrs.alt ?? '');
    if (/^[a-z][a-z0-9+.-]*:/i.test(src) && !src.startsWith('data:image/')) {
      const span = document.createElement('span');
      span.className = 'ed-remote-img';
      span.textContent = `Picture from the internet${alt ? `: ${alt}` : ''}`;
      return span;
    }
    const img = document.createElement('img');
    img.alt = alt;
    img.src = src.startsWith('data:') ? src : assetUrl(loc.collectionId, resolvePath(loc.path, safeDecode(src).replace(/\\/g, '/')));
    return img;
  }

  function applySource() {
    const s = sourceEdit;
    const raw = sourceText;
    sourceEdit = null;
    if (!s || !view) return;
    const node = view.state.doc.nodeAt(s.pos);
    if (node?.type.name === 'markvy_card') view.dispatch(view.state.tr.setNodeMarkup(s.pos, undefined, { ...node.attrs, raw: raw.endsWith('\n') ? raw : raw + '\n' }));
  }

  async function addPicture(file: File, at?: number) {
    if (!PICTURE.test(file.type) || file.size > MAX_PICTURE) { app.notice = MESSAGES.PictureRejected; return; }
    try {
      const base64 = await new Promise<string>((ok, fail) => {
        const r = new FileReader();
        r.onload = () => ok(String(r.result).split(',')[1]);
        r.onerror = () => fail(r.error);
        r.readAsDataURL(file);
      });
      const link = await app.api.savePicture(loc.collectionId, loc.path, base64);
      if (!view) return;
      const image = view.state.schema.nodes.image.create({ src: link.split('/').map(encodeURIComponent).join('/'), alt: '' });
      const tr = view.state.tr;
      if (at !== undefined) tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(at, tr.doc.content.size)))); // a drop lands where it was let go
      view.dispatch(tr.replaceSelectionWith(image));
    } catch (e) {
      app.report(e);
    }
  }

  const canSave = $derived(session.state === 'dirty' || session.state === 'error');

  function onKey(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (canSave) void session.save();
    }
  }

  // Links: a web address, or another page of this folder as a wiki link.
  let linkAsk = $state<'web' | 'page' | null>(null);
  let linkValue = $state('');
  const pages = $derived(app.filesFor(loc.collectionId).filter((p) => /\.(md|markdown|txt)$/i.test(p) && p !== loc.path));
  const pageMatches = $derived(pages.filter((p) => p.toLowerCase().includes(linkValue.trim().toLowerCase())).slice(0, 50));

  function addWebLink() {
    const href = linkValue.trim();
    linkAsk = null;
    if (!codec || !href) return;
    linkTo(codec, href);
    void tick().then(() => view?.focus()); // after the dialog has gone: it hands focus back to the toolbar button
  }

  function insertWiki(path: string) {
    linkAsk = null;
    if (!view) return;
    const name = path.split('/').pop()!.replace(/\.(md|markdown|txt)$/i, '');
    view.dispatch(view.state.tr.replaceSelectionWith(view.state.schema.nodes.markvy_wiki.create({ raw: `[[${name}]]` })));
    void tick().then(() => view?.focus()); // after the dialog has gone: it hands focus back to the toolbar button
  }

  function leave(choice: 'save' | 'keep' | 'discard') {
    leaving = false;
    confirmDiscard = false;
    app.stopEditing(key, choice).catch((e) => app.report(e));
  }

  type Tool = { label: string; icon?: string; text?: string; act: () => void } | null;
  const tools: Tool[] = [
    { label: 'Undo (Ctrl+Z)', icon: 'undo', act: () => run(undoCommand.key) },
    { label: 'Redo (Ctrl+Y)', icon: 'redo', act: () => run(redoCommand.key) },
    null,
    ...[1, 2, 3].map((level) => ({ label: `H${level} heading`, text: `H${level}`, act: () => run(wrapInHeadingCommand.key, level) })),
    { label: 'Bold (Ctrl+B)', icon: 'bold', act: () => run(toggleStrongCommand.key) },
    { label: 'Italic (Ctrl+I)', icon: 'italic', act: () => run(toggleEmphasisCommand.key) },
    { label: 'Strikethrough', icon: 'strike', act: () => run(toggleStrikethroughCommand.key) },
    { label: 'Inline code', icon: 'code', act: () => run(toggleInlineCodeCommand.key) },
    { label: 'Link to a web address', icon: 'link', act: () => { linkValue = ''; linkAsk = 'web'; } },
    { label: 'Link to another page', icon: 'file', act: () => { linkValue = ''; linkAsk = 'page'; } },
    null,
    { label: 'Bulleted list', icon: 'list', act: () => run(wrapInBulletListCommand.key) },
    { label: 'Numbered list', icon: 'list-ol', act: () => run(wrapInOrderedListCommand.key) },
    { label: 'Quote', icon: 'quote', act: () => run(wrapInBlockquoteCommand.key) },
    { label: 'Code block', icon: 'code-block', act: () => run(createCodeBlockCommand.key) },
    { label: 'Insert table', icon: 'table', act: () => run(insertTableCommand.key, { row: 3, col: 3 }) },
    { label: 'Add table row', icon: 'row-add', act: () => run(addRowAfterCommand.key) },
    { label: 'Add table column', icon: 'col-add', act: () => run(addColAfterCommand.key) },
    { label: 'Delete selected cells', icon: 'trash', act: () => run(deleteSelectedCellsCommand.key) },
  ];
  const status = $derived.by(() => {
    if (session.state === 'saving') return 'Saving…';
    if (session.state === 'conflict') return 'Changed on disk';
    if (session.state === 'clean') return 'Saved';
    const at = session.draftAt && !session.draftFailing ? ` · backed up ${new Date(session.draftAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '';
    return `Unsaved changes${at}${session.draftFailing ? ` · ${MESSAGES.DraftsFailing}` : ''}`;
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="editor" onkeydown={onKey}>
  <!-- Buttons keep the keyboard in the text: a click must not move focus out of the editor. -->
  <!-- svelte-ignore a11y_interactive_supports_focus -->
  <div class="ed-toolbar" role="toolbar" aria-label="Formatting" onmousedown={(e) => e.preventDefault()}>
    {#each tools as tool, i (i)}
      {#if tool}
        <button class="icon-btn sm" aria-label={tool.label} title={tool.label} onclick={tool.act}>{#if tool.icon}<Icon name={tool.icon} />{:else}{tool.text}{/if}</button>
      {:else}
        <span class="sep"></span>
      {/if}
    {/each}
    {#if session.state !== 'clean'}<span class="draft-dot" aria-hidden="true"></span>{/if}
    <span class="ed-status" role="status">
      {status}
    </span>
    {#if session.state === 'conflict' && conflictHidden}<button class="link-btn ed-reopen" onclick={() => (conflictHidden = false)}>Choose what to keep</button>{/if}
    <button class="btn btn-primary sm" disabled={!canSave} onclick={() => session.save()}>Save</button>
    <button class="btn sm" onclick={() => (session.state === 'clean' ? leave('keep') : (leaving = true))}>Done</button>
  </div>
  {#if session.error}<p class="ed-error" role="alert">{session.error}</p>{/if}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="ed-host" onclick={(e) => { if ((e.target as Element).closest('a')) e.preventDefault(); }}>
    <div class="doc" bind:this={host}></div>
  </div>
</div>

{#if session.state === 'conflict' && session.conflict && !conflictHidden}
  <ConflictDialog {session} onclose={() => (conflictHidden = true)} />
{/if}

{#if sourceEdit}
  <Dialog title="Edit source" wide onclose={() => (sourceEdit = null)}>
    <label class="ed-source-label" for="ed-source">Markdown for this block</label>
    <textarea id="ed-source" class="ed-source" data-autofocus rows="14" spellcheck="false" bind:value={sourceText}></textarea>
    {#snippet actions()}
      <button class="btn" onclick={() => (sourceEdit = null)}>Cancel</button>
      <button class="btn btn-primary" onclick={applySource}>Apply</button>
    {/snippet}
  </Dialog>
{/if}

{#if linkAsk === 'web'}
  <Dialog title="Link to a web address" onclose={() => (linkAsk = null)}>
    <label class="ed-field">Address <input data-autofocus bind:value={linkValue} placeholder="https://…" onkeydown={(e) => { if (e.key === 'Enter' && linkValue.trim()) { e.preventDefault(); addWebLink(); } }} /></label>
    {#snippet actions()}
      <button class="btn" onclick={() => (linkAsk = null)}>Cancel</button>
      <button class="btn btn-primary" disabled={!linkValue.trim()} onclick={addWebLink}>Add link</button>
    {/snippet}
  </Dialog>
{:else if linkAsk === 'page'}
  <Dialog title="Link to another page" onclose={() => (linkAsk = null)}>
    <label class="ed-field">Find a page <input data-autofocus bind:value={linkValue} /></label>
    <ul class="page-pick" aria-label="Pages">
      {#each pageMatches as p (p)}<li><button class="link-btn" onclick={() => insertWiki(p)}>{p}</button></li>{:else}<li class="muted small">No pages match.</li>{/each}
    </ul>
    {#snippet actions()}<button class="btn" onclick={() => (linkAsk = null)}>Cancel</button>{/snippet}
  </Dialog>
{/if}

{#if leaving}
  <Dialog title="Unsaved changes" onclose={() => { leaving = false; confirmDiscard = false; }}>
    <p>{confirmDiscard ? 'Discard your changes? This can’t be undone.' : 'Save your changes to this page?'}</p>
    {#snippet actions()}
      {#if confirmDiscard}
        <button class="btn" onclick={() => (confirmDiscard = false)}>Back</button>
        <button class="btn btn-danger" onclick={() => leave('discard')}>Discard</button>
      {:else}
        <button class="btn" onclick={() => (confirmDiscard = true)}>Discard</button>
        <button class="btn" onclick={() => leave('keep')}>Keep draft</button>
        <button class="btn btn-primary" data-autofocus onclick={() => leave('save')}>Save</button>
      {/if}
    {/snippet}
  </Dialog>
{/if}
