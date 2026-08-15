import { watch, type FSWatcher, statSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  createIgnoreMatcher,
  listFilesRecursive,
  relativePosix,
  type EventBus,
  type Logger,
  Events,
} from "@arcframe/core";
import type { ArcStore } from "@arcframe/storage";
import { createGraphBuilder } from "@arcframe/graph";
import { adapterForPath } from "./adapters/index.js";
import { createIndexer } from "./indexer.js";

export interface WatchOptions {
  root: string;
  store: ArcStore;
  logger?: Logger;
  events?: EventBus;
  /** Trailing debounce before flush. Default 400. */
  debounceMs?: number;
  /**
   * Max wait from first change in a batch before forced flush
   * (prevents continuous edits from starving invalidation). Default 2000.
   */
  maxWaitMs?: number;
  /**
   * When a batch exceeds this many files, coalesce reporting/invalidation
   * to unique top-level package directories. Default 12.
   */
  batchCoalesceThreshold?: number;
  rebuildGraph?: boolean;
  /** Force polling even when native recursive watch works. */
  forcePoll?: boolean;
  /** Polling interval (ms). Default 1500. */
  pollIntervalMs?: number;
}

export interface IndexWatcher {
  close(): void;
  readonly mode: "native" | "poll" | "hybrid";
  /** Pending relative paths waiting for debounce flush (test/observability). */
  readonly pendingCount: number;
}

type MtimeMap = Map<string, number>;

function shouldPreferPoll(): boolean {
  return process.platform === "linux";
}

/** Collapse noisy paths into unique package / top-level dirs for batch invalidation. */
export function coalesceInvalidationBatch(
  root: string,
  relPaths: string[],
  threshold = 12,
): { changed: string[]; coalescedDirs: string[]; coalesced: boolean } {
  if (relPaths.length < threshold) {
    return { changed: [...new Set(relPaths)], coalescedDirs: [], coalesced: false };
  }
  const dirs = new Set<string>();
  for (const rel of relPaths) {
    const parts = rel.replaceAll("\\", "/").split("/");
    if (
      (parts[0] === "packages" ||
        parts[0] === "apps" ||
        parts[0] === "servers" ||
        parts[0] === "cli" ||
        parts[0] === "fixtures") &&
      parts.length >= 2
    ) {
      dirs.add(`${parts[0]}/${parts[1]}`);
    } else if (parts.length >= 2) {
      dirs.add(parts[0]!);
    } else {
      dirs.add(dirname(rel) || ".");
    }
  }
  void root;
  return {
    changed: [...new Set(relPaths)],
    coalescedDirs: [...dirs].sort(),
    coalesced: true,
  };
}

/**
 * FS watcher with trailing debounce, max-wait flush, and batch coalescing.
 * Native recursive watch on Windows/macOS; polling fallback (or hybrid) for Linux
 * and when native watch fails.
 */
export function startIndexWatcher(options: WatchOptions): IndexWatcher {
  const { root, store, logger, events } = options;
  const debounceMs = options.debounceMs ?? 400;
  const maxWaitMs = options.maxWaitMs ?? 2000;
  const batchCoalesceThreshold = options.batchCoalesceThreshold ?? 12;
  const pollIntervalMs = options.pollIntervalMs ?? 1500;
  const rebuildGraph = options.rebuildGraph ?? true;
  const ignore = createIgnoreMatcher(root);
  const pending = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let maxWaitTimer: ReturnType<typeof setTimeout> | null = null;
  let batchStartedAt: number | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let closed = false;
  let nativeWatcher: FSWatcher | null = null;
  let mode: "native" | "poll" | "hybrid" = "poll";
  let flushing = false;

  const indexer = createIndexer({
    root,
    store,
    logger,
    events,
    incremental: true,
  });

  const clearTimers = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (maxWaitTimer) clearTimeout(maxWaitTimer);
    maxWaitTimer = null;
    batchStartedAt = null;
  };

  const flush = async (): Promise<void> => {
    if (closed || pending.size === 0 || flushing) return;
    flushing = true;
    const rawChanged = [...pending];
    pending.clear();
    clearTimers();
    const batch = coalesceInvalidationBatch(root, rawChanged, batchCoalesceThreshold);
    logger?.info("FS change batch", {
      count: batch.changed.length,
      sample: batch.changed.slice(0, 5),
      coalesced: batch.coalesced,
      coalescedDirs: batch.coalesced ? batch.coalescedDirs : undefined,
      mode,
    });
    try {
      const result = await indexer.build(false);
      if (rebuildGraph && (result.progress.indexed > 0 || result.progress.removed > 0)) {
        createGraphBuilder({ store, logger, events }).build();
      }
      await events?.emit(Events.INDEX_COMPLETED, {
        ...result,
        trigger: "watch",
        changed: batch.changed,
        coalescedDirs: batch.coalescedDirs,
        coalesced: batch.coalesced,
        mode,
      });
    } catch (err) {
      logger?.error("Watch incremental index failed", {
        error: (err as Error).message,
      });
    } finally {
      flushing = false;
      if (pending.size > 0) {
        schedule("");
      }
    }
  };

  const schedule = (relOrAbs: string): void => {
    if (relOrAbs) {
      const abs =
        relOrAbs.includes(root) ||
        /^[A-Za-z]:[\\/]/.test(relOrAbs) ||
        relOrAbs.startsWith("/")
          ? relOrAbs
          : join(root, relOrAbs);
      if (!ignore.ignores(abs, root)) {
        pending.add(relativePosix(root, abs));
      }
    }
    if (pending.size === 0) return;

    const now = Date.now();
    if (batchStartedAt == null) {
      batchStartedAt = now;
      maxWaitTimer = setTimeout(() => {
        void flush();
      }, maxWaitMs);
    }

    const adaptive = Math.min(
      debounceMs + Math.min(pending.size * 15, 300),
      Math.max(50, maxWaitMs - (now - (batchStartedAt ?? now))),
    );
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void flush();
    }, adaptive);
  };

  const snapshotMtimes = (): MtimeMap => {
    const map: MtimeMap = new Map();
    const files = listFilesRecursive(root, {
      filter: (p) => {
        if (ignore.ignores(p, root)) return false;
        return Boolean(adapterForPath(p));
      },
    });
    for (const abs of files) {
      try {
        const st = statSync(abs);
        map.set(relativePosix(root, abs), Math.floor(st.mtimeMs));
      } catch {
        /* ignore */
      }
    }
    return map;
  };

  let lastSnap = snapshotMtimes();

  const pollOnce = (): void => {
    if (closed) return;
    const next = snapshotMtimes();
    for (const [rel, mtime] of next) {
      const prev = lastSnap.get(rel);
      if (prev === undefined || prev !== mtime) {
        schedule(join(root, rel));
      }
    }
    for (const rel of lastSnap.keys()) {
      if (!next.has(rel)) {
        schedule(join(root, rel));
      }
    }
    lastSnap = next;
  };

  const startPoll = (): void => {
    if (pollTimer) return;
    pollTimer = setInterval(pollOnce, pollIntervalMs);
    logger?.info("Polling watcher active", { pollIntervalMs });
  };

  const startNative = (): boolean => {
    try {
      nativeWatcher = watch(root, { recursive: true }, (_event, filename) => {
        if (!filename || closed) return;
        schedule(join(root, filename.toString()));
      });
      nativeWatcher.on("error", (err) => {
        logger?.warn("Native watch error — enabling poll fallback", {
          error: (err as Error).message,
        });
        startPoll();
        mode = "hybrid";
      });
      return true;
    } catch (err) {
      logger?.warn("Recursive watch unavailable", {
        error: (err as Error).message,
      });
      return false;
    }
  };

  const forcePoll = options.forcePoll ?? false;
  const preferPoll = forcePoll || shouldPreferPoll();

  if (preferPoll) {
    startPoll();
    mode = "poll";
    if (!forcePoll && startNative()) {
      mode = "hybrid";
    }
  } else if (startNative()) {
    mode = "native";
  } else {
    startPoll();
    mode = "poll";
  }

  logger?.info("Index watcher started", {
    root,
    debounceMs,
    maxWaitMs,
    batchCoalesceThreshold,
    mode,
  });

  return {
    get mode() {
      return mode;
    },
    get pendingCount() {
      return pending.size;
    },
    close() {
      closed = true;
      clearTimers();
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
      try {
        nativeWatcher?.close();
      } catch {
        /* ignore */
      }
      logger?.info("Index watcher stopped", { mode });
    },
  };
}
