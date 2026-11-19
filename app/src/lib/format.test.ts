import { describe, expect, it } from 'vitest';
import { formatSize, timeAgo } from './format';

describe('format', () => {
  it('formats file sizes', () => {
    expect([formatSize(1), formatSize(900), formatSize(2048), formatSize(5.5 * 1024 * 1024)]).toEqual(['1 byte', '900 bytes', '2 KB', '5.5 MB']);
  });

  it('says how long ago', () => {
    const now = 10 * 86_400_000;
    expect([timeAgo(now - 5_000, now), timeAgo(now - 5 * 60_000, now), timeAgo(now - 3 * 3_600_000, now), timeAgo(now - 86_400_000, now), timeAgo(now - 2 * 86_400_000, now)])
      .toEqual(['just now', '5 min ago', '3 h ago', '1 day ago', '2 days ago']);
  });
});
