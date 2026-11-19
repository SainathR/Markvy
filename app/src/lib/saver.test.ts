import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSaver } from './saver';

describe('saver', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('saves at most once per interval', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const s = createSaver(save, 1000, vi.fn());
    s.schedule(); s.schedule(); s.schedule();
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('flushes pending work at once, and does nothing when idle', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const s = createSaver(save, 1000, vi.fn());
    await s.flush();
    expect(save).not.toHaveBeenCalled();
    s.schedule();
    await s.flush();
    expect(save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('reports a failed save', async () => {
    const onError = vi.fn();
    const s = createSaver(() => Promise.reject({ code: 'Internal' }), 1000, onError);
    s.schedule();
    await s.flush();
    expect(onError).toHaveBeenCalledWith({ code: 'Internal' });
  });

  it('never overlaps saves: a flush during an unresolved save waits for it', async () => {
    const events: string[] = [];
    let calls = 0;
    let finishFirst!: () => void;
    const save = vi.fn(() => {
      calls += 1;
      events.push(`start ${calls}`);
      if (calls === 1) {
        return new Promise<void>((resolve) => {
          finishFirst = () => {
            events.push('done 1');
            resolve();
          };
        });
      }
      return Promise.resolve();
    });
    const s = createSaver(save, 1000, vi.fn());
    s.schedule();
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);

    s.schedule();
    const done = s.flush();
    expect(save).toHaveBeenCalledTimes(1);

    finishFirst();
    await done;
    expect(save).toHaveBeenCalledTimes(2);
    expect(events).toEqual(['start 1', 'done 1', 'start 2']);
  });
});
