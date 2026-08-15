import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

export interface CacheStore {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T, ttlMs?: number): void;
  has(key: string): boolean;
  delete(key: string): void;
  clear(): void;
  getOrSet<T>(key: string, factory: () => T | Promise<T>, ttlMs?: number): Promise<T>;
}

interface CacheEntry {
  value: unknown;
  expiresAt?: number;
}

function cacheKeyHash(key: string): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 32);
}

export class MemoryCache implements CacheStore {
  private readonly store = new Map<string, CacheEntry>();

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs?: number): void {
    this.store.set(key, {
      value,
      expiresAt: ttlMs ? Date.now() + ttlMs : undefined,
    });
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  async getOrSet<T>(
    key: string,
    factory: () => T | Promise<T>,
    ttlMs?: number,
  ): Promise<T> {
    const existing = this.get<T>(key);
    if (existing !== undefined) return existing;
    const value = await factory();
    this.set(key, value, ttlMs);
    return value;
  }
}

export class FileCache implements CacheStore {
  private readonly memory = new MemoryCache();

  constructor(private readonly dir: string) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  private pathFor(key: string): string {
    return join(this.dir, `${cacheKeyHash(key)}.json`);
  }

  get<T>(key: string): T | undefined {
    const mem = this.memory.get<T>(key);
    if (mem !== undefined) return mem;
    const path = this.pathFor(key);
    if (!existsSync(path)) return undefined;
    try {
      const entry = JSON.parse(readFileSync(path, "utf8")) as CacheEntry;
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        unlinkSync(path);
        return undefined;
      }
      this.memory.set(key, entry.value as T, entry.expiresAt ? entry.expiresAt - Date.now() : undefined);
      return entry.value as T;
    } catch {
      return undefined;
    }
  }

  set<T>(key: string, value: T, ttlMs?: number): void {
    this.memory.set(key, value, ttlMs);
    const entry: CacheEntry = {
      value,
      expiresAt: ttlMs ? Date.now() + ttlMs : undefined,
    };
    writeFileSync(this.pathFor(key), JSON.stringify(entry), "utf8");
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): void {
    this.memory.delete(key);
    const path = this.pathFor(key);
    if (existsSync(path)) {
      unlinkSync(path);
    }
  }

  clear(): void {
    this.memory.clear();
    // Best-effort: leave directory; entries expire or overwrite
  }

  async getOrSet<T>(
    key: string,
    factory: () => T | Promise<T>,
    ttlMs?: number,
  ): Promise<T> {
    const existing = this.get<T>(key);
    if (existing !== undefined) return existing;
    const value = await factory();
    this.set(key, value, ttlMs);
    return value;
  }
}

export function createCache(dir?: string): CacheStore {
  if (dir) return new FileCache(dir);
  return new MemoryCache();
}
