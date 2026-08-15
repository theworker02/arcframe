import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  Events,
  createIgnoreMatcher,
  hashContent,
  listFilesRecursive,
  relativePosix,
  tryNativeHashwalk,
  type EventBus,
  type HashwalkEntry,
  type Logger,
} from "@arcframe/core";
import type { ArcStore } from "@arcframe/storage";
import { adapterForPath } from "./adapters/index.js";
import { detectFrameworksInFile } from "./frameworks.js";
import type { FileAnalysis, IndexProgress, IndexResult } from "./types.js";

function symbolId(filePath: string, name: string, line: number): string {
  return createHash("sha1")
    .update(`${filePath}:${name}:${line}`)
    .digest("hex")
    .slice(0, 16);
}

export interface IndexerOptions {
  root: string;
  store: ArcStore;
  logger?: Logger;
  events?: EventBus;
  incremental?: boolean;
  ignoreFile?: string;
  /** Prefer native arcframe-hashwalk when available (default true). */
  preferNativeHashwalk?: boolean;
}

export class Indexer {
  constructor(private readonly options: IndexerOptions) {}

  async build(forceFull = false): Promise<IndexResult> {
    const start = Date.now();
    const { root, store, logger, events } = this.options;
    const incremental = !forceFull && (this.options.incremental ?? true);
    const ignore = createIgnoreMatcher(root, this.options.ignoreFile);
    const preferNative = this.options.preferNativeHashwalk ?? true;

    await events?.emit(Events.INDEX_STARTED, { root, incremental });

    const progress: IndexProgress = {
      scanned: 0,
      indexed: 0,
      skipped: 0,
      removed: 0,
      languages: {},
    };

    // Optional Rust accelerator: parallel walk + content hash for invalidation.
    // Falls back to the TypeScript walker when the binary is missing.
    let nativeEntries: HashwalkEntry[] | null = null;
    if (preferNative) {
      const native = await tryNativeHashwalk(root, {
        ignoreFile: this.options.ignoreFile,
      });
      if (native && native.entries.length > 0) {
        nativeEntries = native.entries;
        logger?.debug("Using native arcframe-hashwalk", {
          binary: native.binary,
          files: native.entries.length,
          durationMs: native.durationMs,
        });
      }
    }

    const existingPaths = new Set<string>();

    store.transaction(() => {
      if (nativeEntries) {
        this.indexFromNative(nativeEntries, {
          root,
          store,
          ignore,
          incremental,
          progress,
          existingPaths,
          logger,
          events,
        });
      } else {
        this.indexFromTsWalk({
          root,
          store,
          ignore,
          incremental,
          progress,
          existingPaths,
          logger,
          events,
        });
      }

      progress.removed = store.deleteMissingFiles(existingPaths);
    });

    store.setMeta("index:last_built", new Date().toISOString());
    store.setMeta("index:file_count", String(progress.scanned));
    if (nativeEntries) {
      store.setMeta("index:hashwalk", "native");
    } else {
      store.setMeta("index:hashwalk", "typescript");
    }

    const result: IndexResult = {
      progress,
      durationMs: Date.now() - start,
      incremental,
    };

    await events?.emit(Events.INDEX_COMPLETED, result);
    logger?.info("Index build complete", {
      indexed: progress.indexed,
      skipped: progress.skipped,
      removed: progress.removed,
      durationMs: result.durationMs,
      hashwalk: nativeEntries ? "native" : "typescript",
    });

    return result;
  }

  private indexFromNative(
    entries: HashwalkEntry[],
    ctx: {
      root: string;
      store: ArcStore;
      ignore: ReturnType<typeof createIgnoreMatcher>;
      incremental: boolean;
      progress: IndexProgress;
      existingPaths: Set<string>;
      logger?: Logger;
      events?: EventBus;
    },
  ): void {
    const { root, store, ignore, incremental, progress, existingPaths, logger, events } =
      ctx;

    for (const entry of entries) {
      const abs = join(root, ...entry.path.split("/"));
      if (ignore.ignores(abs, root)) continue;
      if (!adapterForPath(abs)) continue;

      progress.scanned++;
      existingPaths.add(entry.path);

      const prev = store.getFile(entry.path);
      if (incremental && prev && prev.hash === entry.hash) {
        progress.skipped++;
        continue;
      }

      let content: string;
      try {
        content = readFileSync(abs, "utf8");
      } catch {
        progress.skipped++;
        continue;
      }

      this.upsertAnalysis({
        root,
        store,
        rel: entry.path,
        abs,
        content,
        hash: entry.hash,
        size: entry.size,
        mtime: entry.mtime,
        progress,
        logger,
        events,
      });
    }
  }

  private indexFromTsWalk(ctx: {
    root: string;
    store: ArcStore;
    ignore: ReturnType<typeof createIgnoreMatcher>;
    incremental: boolean;
    progress: IndexProgress;
    existingPaths: Set<string>;
    logger?: Logger;
    events?: EventBus;
  }): void {
    const { root, store, ignore, incremental, progress, existingPaths, logger, events } =
      ctx;

    const files = listFilesRecursive(root, {
      filter: (p) => {
        if (ignore.ignores(p, root)) return false;
        return Boolean(adapterForPath(p));
      },
    });

    for (const abs of files) {
      progress.scanned++;
      const rel = relativePosix(root, abs);
      existingPaths.add(rel);

      let content: string;
      let st;
      try {
        st = statSync(abs);
        content = readFileSync(abs, "utf8");
      } catch {
        progress.skipped++;
        continue;
      }

      const hash = hashContent(content);
      const prev = store.getFile(rel);
      if (incremental && prev && prev.hash === hash) {
        progress.skipped++;
        continue;
      }

      this.upsertAnalysis({
        root,
        store,
        rel,
        abs,
        content,
        hash,
        size: st.size,
        mtime: Math.floor(st.mtimeMs),
        progress,
        logger,
        events,
      });
    }
  }

  private upsertAnalysis(args: {
    root: string;
    store: ArcStore;
    rel: string;
    abs: string;
    content: string;
    hash: string;
    size: number;
    mtime: number;
    progress: IndexProgress;
    logger?: Logger;
    events?: EventBus;
  }): void {
    const { store, rel, abs, content, hash, size, mtime, progress, logger, events } =
      args;

    const adapter = adapterForPath(abs);
    if (!adapter) {
      progress.skipped++;
      return;
    }

    let analysis: FileAnalysis;
    try {
      analysis = adapter.analyzeFile(abs, content, rel);
    } catch (err) {
      logger?.warn(`Failed to analyze ${rel}`, {
        error: (err as Error).message,
      });
      progress.skipped++;
      return;
    }

    store.upsertFile({
      path: rel,
      hash,
      language: analysis.language,
      size,
      mtime,
      indexed_at: Date.now(),
    });

    store.clearSymbolsForFile(rel);
    for (const sym of analysis.symbols) {
      store.upsertSymbol({
        id: symbolId(rel, sym.name, sym.line),
        file_path: rel,
        name: sym.name,
        kind: sym.kind,
        line: sym.line,
        end_line: sym.endLine ?? null,
        exported: sym.exported ? 1 : 0,
        signature: sym.signature ?? null,
      });
    }

    store.setMeta(`imports:${rel}`, JSON.stringify(analysis.imports));
    if (analysis.routes?.length) {
      store.setMeta(`routes:${rel}`, JSON.stringify(analysis.routes));
    }
    const frameworks = detectFrameworksInFile(content, rel);
    if (frameworks.length) {
      store.setMeta(`frameworks:${rel}`, JSON.stringify(frameworks));
    }

    progress.indexed++;
    progress.languages[analysis.language] =
      (progress.languages[analysis.language] ?? 0) + 1;

    void events?.emit(Events.INDEX_FILE, { path: rel, language: analysis.language });
  }

  explain(filePath: string): Record<string, unknown> {
    const { root, store } = this.options;
    const rel = filePath.includes("/") || filePath.includes("\\")
      ? relativePosix(root, join(root, filePath))
      : filePath.replaceAll("\\", "/");
    const file = store.getFile(rel);
    const symbols = store.listSymbols(rel);
    const importsRaw = store.getMeta(`imports:${rel}`);
    return {
      path: rel,
      file: file ?? null,
      symbols,
      imports: importsRaw ? JSON.parse(importsRaw) : [],
      confidence: file ? "confirmed" : "unknown",
    };
  }

  status(): Record<string, unknown> {
    const { store } = this.options;
    return {
      lastBuilt: store.getMeta("index:last_built"),
      stats: store.stats(),
      hashwalk: store.getMeta("index:hashwalk") ?? "unknown",
      confidence: store.getMeta("index:last_built") ? "confirmed" : "unknown",
    };
  }
}

export function createIndexer(options: IndexerOptions): Indexer {
  return new Indexer(options);
}
