import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export interface CacheEntry<T> {
  storedAt: string;
  ttlMs: number;
  value: T;
}

export interface Cache {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>;
  keyOf(parts: ReadonlyArray<string | number | boolean>): string;
}

export function fileSystemCache(rootDir: string, defaultTtlMs = DEFAULT_TTL_MS): Cache {
  return {
    async get<T>(key: string): Promise<T | undefined> {
      const path = join(rootDir, `${key}.json`);
      try {
        const raw = await readFile(path, 'utf8');
        const entry = JSON.parse(raw) as CacheEntry<T>;
        const age = Date.now() - Date.parse(entry.storedAt);
        if (age > entry.ttlMs) return undefined;
        return entry.value;
      } catch {
        return undefined;
      }
    },
    async set<T>(key: string, value: T, ttlMs = defaultTtlMs): Promise<void> {
      const path = join(rootDir, `${key}.json`);
      const entry: CacheEntry<T> = { storedAt: new Date().toISOString(), ttlMs, value };
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, JSON.stringify(entry), 'utf8');
    },
    keyOf(parts: ReadonlyArray<string | number | boolean>): string {
      const joined = parts.map((p) => String(p)).join('|');
      return createHash('sha256').update(joined).digest('hex').slice(0, 16);
    },
  };
}

export function memoryCache(defaultTtlMs = DEFAULT_TTL_MS): Cache {
  const store = new Map<string, CacheEntry<unknown>>();
  return {
    async get<T>(key: string): Promise<T | undefined> {
      const entry = store.get(key) as CacheEntry<T> | undefined;
      if (!entry) return undefined;
      const age = Date.now() - Date.parse(entry.storedAt);
      if (age > entry.ttlMs) {
        store.delete(key);
        return undefined;
      }
      return entry.value;
    },
    async set<T>(key: string, value: T, ttlMs = defaultTtlMs): Promise<void> {
      store.set(key, { storedAt: new Date().toISOString(), ttlMs, value });
    },
    keyOf(parts: ReadonlyArray<string | number | boolean>): string {
      const joined = parts.map((p) => String(p)).join('|');
      return createHash('sha256').update(joined).digest('hex').slice(0, 16);
    },
  };
}
