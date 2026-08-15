import { DatabaseSync } from "node:sqlite";
import { StorageError } from "@arcframe/core";
import { SCHEMA_SQL } from "./schema.js";

export interface FileRecord {
  path: string;
  hash: string;
  language: string | null;
  size: number;
  mtime: number;
  indexed_at: number;
}

export interface SymbolRecord {
  id: string;
  file_path: string;
  name: string;
  kind: string;
  line: number;
  end_line: number | null;
  exported: number;
  signature: string | null;
}

export interface EdgeRecord {
  id: string;
  from_id: string;
  to_id: string;
  edge_type: string;
  confidence: string;
  meta: string | null;
}

export interface MemoryRecord {
  id: string;
  type: string;
  title: string;
  content: string;
  tags: string;
  created_at: number;
  updated_at: number;
}

export interface MetaRecord {
  key: string;
  value: string;
}

function asRows<T>(rows: unknown): T[] {
  return rows as T[];
}

function asRow<T>(row: unknown): T | undefined {
  return row as T | undefined;
}

export class ArcStore {
  readonly db: DatabaseSync;
  private closed = false;

  constructor(dbPath: string) {
    try {
      this.db = new DatabaseSync(dbPath);
      this.db.exec("PRAGMA journal_mode = WAL;");
      this.db.exec("PRAGMA foreign_keys = ON;");
      this.migrate();
    } catch (err) {
      throw new StorageError(`Failed to open database: ${(err as Error).message}`, {
        dbPath,
      });
    }
  }

  private migrate(): void {
    this.db.exec(SCHEMA_SQL);
  }

  close(): void {
    if (!this.closed) {
      this.db.close();
      this.closed = true;
    }
  }

  getMeta(key: string): string | null {
    const row = asRow<MetaRecord>(
      this.db.prepare("SELECT value FROM meta WHERE key = ?").get(key),
    );
    return row?.value ?? null;
  }

  setMeta(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO meta (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, value);
  }

  upsertFile(file: FileRecord): void {
    this.db
      .prepare(
        `INSERT INTO files (path, hash, language, size, mtime, indexed_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(path) DO UPDATE SET
           hash = excluded.hash,
           language = excluded.language,
           size = excluded.size,
           mtime = excluded.mtime,
           indexed_at = excluded.indexed_at`,
      )
      .run(
        file.path,
        file.hash,
        file.language,
        file.size,
        file.mtime,
        file.indexed_at,
      );
  }

  getFile(path: string): FileRecord | undefined {
    return asRow<FileRecord>(
      this.db.prepare("SELECT * FROM files WHERE path = ?").get(path),
    );
  }

  listFiles(language?: string): FileRecord[] {
    if (language) {
      return asRows<FileRecord>(
        this.db
          .prepare("SELECT * FROM files WHERE language = ? ORDER BY path")
          .all(language),
      );
    }
    return asRows<FileRecord>(
      this.db.prepare("SELECT * FROM files ORDER BY path").all(),
    );
  }

  deleteMissingFiles(existingPaths: Set<string>): number {
    const all = this.listFiles();
    let removed = 0;
    const del = this.db.prepare("DELETE FROM files WHERE path = ?");
    const delSym = this.db.prepare("DELETE FROM symbols WHERE file_path = ?");
    for (const f of all) {
      if (!existingPaths.has(f.path)) {
        delSym.run(f.path);
        del.run(f.path);
        removed++;
      }
    }
    return removed;
  }

  clearSymbolsForFile(filePath: string): void {
    this.db.prepare("DELETE FROM symbols WHERE file_path = ?").run(filePath);
  }

  upsertSymbol(sym: SymbolRecord): void {
    this.db
      .prepare(
        `INSERT INTO symbols (id, file_path, name, kind, line, end_line, exported, signature)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           kind = excluded.kind,
           line = excluded.line,
           end_line = excluded.end_line,
           exported = excluded.exported,
           signature = excluded.signature`,
      )
      .run(
        sym.id,
        sym.file_path,
        sym.name,
        sym.kind,
        sym.line,
        sym.end_line,
        sym.exported,
        sym.signature,
      );
  }

  findSymbols(query: string, limit = 50): SymbolRecord[] {
    const q = `%${query}%`;
    return asRows<SymbolRecord>(
      this.db
        .prepare(`SELECT * FROM symbols WHERE name LIKE ? ORDER BY name LIMIT ?`)
        .all(q, limit),
    );
  }

  listSymbols(filePath?: string): SymbolRecord[] {
    if (filePath) {
      return asRows<SymbolRecord>(
        this.db
          .prepare("SELECT * FROM symbols WHERE file_path = ? ORDER BY line")
          .all(filePath),
      );
    }
    return asRows<SymbolRecord>(
      this.db.prepare("SELECT * FROM symbols ORDER BY name").all(),
    );
  }

  clearEdges(): void {
    this.db.exec("DELETE FROM edges");
  }

  upsertEdge(edge: EdgeRecord): void {
    this.db
      .prepare(
        `INSERT INTO edges (id, from_id, to_id, edge_type, confidence, meta)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           confidence = excluded.confidence,
           meta = excluded.meta`,
      )
      .run(
        edge.id,
        edge.from_id,
        edge.to_id,
        edge.edge_type,
        edge.confidence,
        edge.meta,
      );
  }

  listEdges(edgeType?: string): EdgeRecord[] {
    if (edgeType) {
      return asRows<EdgeRecord>(
        this.db
          .prepare("SELECT * FROM edges WHERE edge_type = ?")
          .all(edgeType),
      );
    }
    return asRows<EdgeRecord>(this.db.prepare("SELECT * FROM edges").all());
  }

  edgesFrom(fromId: string): EdgeRecord[] {
    return asRows<EdgeRecord>(
      this.db.prepare("SELECT * FROM edges WHERE from_id = ?").all(fromId),
    );
  }

  edgesTo(toId: string): EdgeRecord[] {
    return asRows<EdgeRecord>(
      this.db.prepare("SELECT * FROM edges WHERE to_id = ?").all(toId),
    );
  }

  upsertMemory(mem: MemoryRecord): void {
    this.db
      .prepare(
        `INSERT INTO memory (id, type, title, content, tags, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           type = excluded.type,
           title = excluded.title,
           content = excluded.content,
           tags = excluded.tags,
           updated_at = excluded.updated_at`,
      )
      .run(
        mem.id,
        mem.type,
        mem.title,
        mem.content,
        mem.tags,
        mem.created_at,
        mem.updated_at,
      );
  }

  getMemory(id: string): MemoryRecord | undefined {
    return asRow<MemoryRecord>(
      this.db.prepare("SELECT * FROM memory WHERE id = ?").get(id),
    );
  }

  listMemory(type?: string): MemoryRecord[] {
    if (type) {
      return asRows<MemoryRecord>(
        this.db
          .prepare("SELECT * FROM memory WHERE type = ? ORDER BY updated_at DESC")
          .all(type),
      );
    }
    return asRows<MemoryRecord>(
      this.db.prepare("SELECT * FROM memory ORDER BY updated_at DESC").all(),
    );
  }

  searchMemory(query: string, limit = 50): MemoryRecord[] {
    const q = `%${query}%`;
    return asRows<MemoryRecord>(
      this.db
        .prepare(
          `SELECT * FROM memory
           WHERE title LIKE ? OR content LIKE ? OR tags LIKE ?
           ORDER BY updated_at DESC LIMIT ?`,
        )
        .all(q, q, q, limit),
    );
  }

  deleteMemory(id: string): boolean {
    const result = this.db.prepare("DELETE FROM memory WHERE id = ?").run(id);
    return result.changes > 0;
  }

  stats(): Record<string, number> {
    const files = (
      this.db.prepare("SELECT COUNT(*) AS c FROM files").get() as { c: number }
    ).c;
    const symbols = (
      this.db.prepare("SELECT COUNT(*) AS c FROM symbols").get() as { c: number }
    ).c;
    const edges = (
      this.db.prepare("SELECT COUNT(*) AS c FROM edges").get() as { c: number }
    ).c;
    const memory = (
      this.db.prepare("SELECT COUNT(*) AS c FROM memory").get() as { c: number }
    ).c;
    return { files, symbols, edges, memory };
  }

  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }
}

export function openStore(dbPath: string): ArcStore {
  return new ArcStore(dbPath);
}
