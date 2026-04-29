import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { fileSystemCache, memoryCache } from '../src/cache.js';

describe('memoryCache', () => {
  it('round-trips values', async () => {
    const cache = memoryCache();
    await cache.set('k', { a: 1 });
    expect(await cache.get<{ a: number }>('k')).toEqual({ a: 1 });
  });

  it('expires past TTL', async () => {
    const cache = memoryCache(50);
    await cache.set('k', 'v');
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 5_000);
    expect(await cache.get('k')).toBeUndefined();
    vi.useRealTimers();
  });

  it('keyOf is deterministic and short', () => {
    const cache = memoryCache();
    const k1 = cache.keyOf(['user', 'octocat']);
    const k2 = cache.keyOf(['user', 'octocat']);
    expect(k1).toBe(k2);
    expect(k1).toHaveLength(16);
  });
});

describe('fileSystemCache', () => {
  it('persists and reads from disk', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dp-cache-'));
    const cache = fileSystemCache(dir);
    await cache.set('one', { hello: 'world' });
    const fresh = fileSystemCache(dir);
    expect(await fresh.get<{ hello: string }>('one')).toEqual({ hello: 'world' });
  });

  it('returns undefined for missing keys', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dp-cache-'));
    const cache = fileSystemCache(dir);
    expect(await cache.get('missing')).toBeUndefined();
  });
});
