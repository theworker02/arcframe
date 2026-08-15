import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  Events,
  createIgnoreMatcher,
  hashContent,
  listFilesRecursive,
  relativePosix,
  type EventBus,
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
}

export class Indexer {
  constructor(private readonly options: IndexerOptions) {}

  async build(forceFull = false): Promise<IndexResult> {
    const start = Date.now();
    const { root, store, logger, events } = this.options;
    const incremental = !forceFull && (this.options.incremental ?? true);
    const ignore = createIgnoreMatcher(root, this.options.ignoreFile);

    await events?.emit(Events.INDEX_STARTED, { root, incremental });

    const progress: IndexProgress = {
      scanned: 0,
      indexed: 0,
      skipped: 0,
      removed: 0,
      languages: {},
    };

    const files = listFilesRecursive(root, {
      filter: (p) => {
        if (ignore.ignores(p, root)) return false;
        return Boolean(adapterForPath(p));
      },
    });

    const existingPaths = new Set<string>();

    store.transaction(() => {
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

        const adapter = adapterForPath(abs);
        if (!adapter) {
          progress.skipped++;
          continue;
        }

        let analysis: FileAnalysis;
        try {
          analysis = adapter.analyzeFile(abs, content, rel);
        } catch (err) {
          logger?.warn(`Failed to analyze ${rel}`, {
            error: (err as Error).message,
          });
          progress.skipped++;
          continue;
        }

        store.upsertFile({
          path: rel,
          hash,
          language: analysis.language,
          size: st.size,
          mtime: Math.floor(st.mtimeMs),
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

        // Stash imports as JSON in a side meta key for graph builder
        store.setMeta(
          `imports:${rel}`,
          JSON.stringify(analysis.imports),
        );
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

      progress.removed = store.deleteMissingFiles(existingPaths);
    });

    store.setMeta("index:last_built", new Date().toISOString());
    store.setMeta("index:file_count", String(progress.scanned));

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
    });

    return result;
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
      confidence: store.getMeta("index:last_built") ? "confirmed" : "unknown",
    };
  }
}

export function createIndexer(options: IndexerOptions): Indexer {
  return new Indexer(options);
}
