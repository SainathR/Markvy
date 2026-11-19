export interface Saver { schedule(): void; flush(): Promise<void> }

/**
 * Coalesces saves: the first schedule() starts the clock, later ones join it (at most one save per delayMs).
 * Saves never overlap: each run chains onto the in-flight save, so a later save starts only after the earlier one settles.
 */
export function createSaver(save: () => Promise<void>, delayMs: number, onError: (e: unknown) => void): Saver {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending = false;
  let inflight: Promise<void> = Promise.resolve();
  const saveIfPending = async () => {
    if (!pending) return;
    pending = false;
    try {
      await save();
    } catch (e) {
      onError(e);
    }
  };
  const run = () => {
    timer = null;
    // A throwing onError must not wedge the chain and block every later save.
    inflight = inflight.then(saveIfPending).catch(() => {});
    return inflight;
  };
  return {
    schedule() {
      pending = true;
      if (!timer) timer = setTimeout(run, delayMs);
    },
    async flush() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      await run();
    },
  };
}
