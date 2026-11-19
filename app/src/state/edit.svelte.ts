// app/src/state/edit.svelte.ts
import { describeError, MESSAGES, type Draft, type EditSource, type SaveResult } from '../lib/core';
import { copyName } from '../lib/editor/names';
import { merge3, type Merge } from '../lib/editor/merge';
import { parseKey } from '../lib/library';

type Api = Pick<typeof import('../lib/core').core, 'saveDraft' | 'discardDraft' | 'saveDocument' | 'createPage' | 'openForEdit'>;
export type SessionState = 'clean' | 'dirty' | 'saving' | 'conflict' | 'error';
const DRAFT_DELAY = 1000;

export class EditSession {
  baseText = $state('');
  baseHash = $state('');
  text = $state('');
  state = $state<SessionState>('clean');
  draftAt = $state<number | null>(null);
  draftFailing = $state(false);
  conflict = $state<{ theirs: string; theirsHash: string; merged: Merge } | null>(null);
  error = $state<string | null>(null);
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending: Promise<boolean> | null = null;
  private inflight: Promise<void> | null = null;
  private ownHashes = new Set<string>();
  /** True when a draft was made against an older version of the file: its original text is unknown, so nothing is combined automatically. */
  private unknownBase = false;

  constructor(private api: Api, public key: string, source: EditSource, draft: Draft | null = null, private now = () => Date.now()) {
    this.baseText = source.text;
    this.baseHash = source.hash;
    this.text = draft?.text ?? source.text;
    if (draft && draft.text === source.text) {
      // A draft equal to the file says nothing new: drop it and start from the file.
      this.text = source.text;
      const { collectionId, path } = parseKey(key);
      void Promise.resolve(this.api.discardDraft(collectionId, path)).catch(() => {});
    } else if (draft) {
      if (draft.baseHash !== source.hash) { this.baseHash = draft.baseHash; this.unknownBase = true; }
      this.state = 'dirty';
      this.draftAt = draft.savedAt;
    }
  }

  private get loc() { return parseKey(this.key); }

  change(markdown: string): void {
    if (markdown === this.text) return;
    this.text = markdown;
    if (this.state === 'clean' || this.state === 'error') this.state = 'dirty';
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flushDraft(), DRAFT_DELAY);
  }

  /** A save in progress writes the draft itself afterwards; a draft write never overlaps one. */
  async flushDraft(): Promise<void> {
    clearTimeout(this.timer);
    if (this.state === 'clean' || this.state === 'saving') return;
    const p = this.writeDraft().finally(() => { if (this.inflight === p) this.inflight = null; });
    this.inflight = p;
    await p;
  }

  private async writeDraft(): Promise<void> {
    const { collectionId, path } = this.loc;
    const savedAt = this.now();
    try {
      await this.api.saveDraft({ collectionId, path, baseHash: this.baseHash, text: this.text, savedAt });
      if (this.state !== 'clean') this.draftAt = savedAt;
      this.draftFailing = false;
    } catch {
      this.draftFailing = true; // the text stays in memory; the next change tries again
    }
  }

  isOwnSave(hash: string): boolean { return hash === this.baseHash || this.ownHashes.has(hash); }

  save(): Promise<boolean> {
    return this.pending ?? this.write(this.text, this.baseHash);
  }

  /** Resolves when any write in progress (a save or a conflict choice) has finished; never starts one. */
  settled(): Promise<void> {
    return this.pending ? this.pending.then(() => {}, () => {}) : Promise.resolve();
  }

  /** Every write goes through here, so only one runs at a time and `settled` sees it. */
  private write(text: string, base: string, path = this.loc.path): Promise<boolean> {
    const p = this.doWrite(text, base, path).finally(() => { if (this.pending === p) this.pending = null; });
    this.pending = p;
    return p;
  }

  private async doWrite(text: string, base: string, path: string): Promise<boolean> {
    clearTimeout(this.timer);
    if (this.state === 'clean' && path === this.loc.path) return true;
    this.state = 'saving';
    this.error = null;
    if (this.inflight) await this.inflight; // a draft write started earlier must land before the save removes the draft
    let r: SaveResult;
    try {
      r = await this.api.saveDocument(this.loc.collectionId, path, text, base);
    } catch (e) {
      this.state = 'error';
      this.error = (e as { code?: string })?.code === 'AccessDenied' ? MESSAGES.SaveDenied : describeError(e);
      await this.flushDraft();
      return false;
    }
    if (r.status === 'conflict') {
      this.ownHashes.add(r.hash); // shown in the conflict dialog: not news for the "changed on disk" notice
      const merged: Merge = this.unknownBase ? { kind: 'clash', clashes: [{ mine: text, theirs: r.text }] } : merge3(this.baseText, r.text, text);
      this.conflict = { theirs: r.text, theirsHash: r.hash, merged };
      this.state = 'conflict';
      return false;
    }
    this.ownHashes.add(r.hash);
    if (path === this.loc.path) { this.baseText = text; this.baseHash = r.hash; this.unknownBase = false; }
    this.state = this.text === text ? 'clean' : 'dirty';
    this.conflict = null;
    this.draftAt = null;
    if (this.state === 'dirty' && path === this.loc.path) await this.flushDraft(); // typed during the save: back it up against the new base
    return true;
  }

  /** The person's choice in the conflict dialog. The draft goes only after a successful save. */
  async resolve(choice: 'combine' | 'mine' | 'theirs' | 'copy', siblings: string[] = []): Promise<boolean> {
    const c = this.conflict;
    if (!c) return true;
    const { collectionId, path } = this.loc;
    if (choice === 'theirs') {
      this.baseText = this.text = c.theirs;
      this.baseHash = c.theirsHash;
      this.unknownBase = false;
      this.conflict = null;
      this.state = 'clean';
      await this.api.discardDraft(collectionId, path);
      return true;
    }
    if (choice === 'copy') {
      const parts = path.split('/');
      const name = parts.pop()!;
      const folder = parts.join('/');
      const copy = copyName(name, siblings);
      const mine = this.text;
      const created = await this.api.createPage(collectionId, folder, copy, copy.replace(/\.(md|markdown|txt)$/i, ''));
      const fresh = await this.api.openForEdit(collectionId, created);
      const ok = await this.write(mine, fresh.hash, created);
      if (ok) {
        this.baseText = c.theirs; this.baseHash = c.theirsHash; this.unknownBase = false;
        if (this.text === mine) { this.text = c.theirs; this.state = 'clean'; await this.api.discardDraft(collectionId, path); }
        else { this.state = 'dirty'; await this.flushDraft(); } // typed meanwhile: kept, against the file's current version
      }
      return ok;
    }
    let text = this.text;
    if (choice === 'combine') {
      // The text may have changed since the conflict appeared: combine what is there now.
      const merged = this.unknownBase ? c.merged : merge3(this.baseText, c.theirs, this.text);
      if (merged.kind === 'clash') { this.conflict = { ...c, merged }; return false; }
      text = merged.text;
    }
    this.baseText = c.theirs;
    this.text = text;
    this.state = 'dirty';
    return this.write(text, c.theirsHash);
  }

  async discard(): Promise<void> {
    clearTimeout(this.timer);
    const { collectionId, path } = this.loc;
    await this.api.discardDraft(collectionId, path);
    this.text = this.baseText;
    this.state = 'clean';
    this.draftAt = null;
  }

  dispose(): void { clearTimeout(this.timer); }
}
