import { randomUUID } from "node:crypto";
import { Events, type EventBus } from "@arcframe/core";
import type { ArcStore, MemoryRecord } from "@arcframe/storage";

export type MemoryType =
  | "note"
  | "fact"
  | "preference"
  | "pattern"
  | "gotcha"
  | "context"
  | "session-summary";

export interface MemoryInput {
  type: MemoryType | string;
  title: string;
  content: string;
  tags?: string[];
  id?: string;
}

export class MemoryService {
  constructor(
    private readonly store: ArcStore,
    private readonly events?: EventBus,
  ) {}

  write(input: MemoryInput): MemoryRecord {
    const now = Date.now();
    const existing = input.id ? this.store.getMemory(input.id) : undefined;
    const record: MemoryRecord = {
      id: input.id ?? randomUUID(),
      type: input.type,
      title: input.title,
      content: input.content,
      tags: (input.tags ?? []).join(","),
      created_at: existing?.created_at ?? now,
      updated_at: now,
    };
    this.store.upsertMemory(record);
    void this.events?.emit(Events.MEMORY_WRITTEN, record);
    return record;
  }

  get(id: string): MemoryRecord | undefined {
    return this.store.getMemory(id);
  }

  list(type?: string): MemoryRecord[] {
    return this.store.listMemory(type);
  }

  search(query: string, limit = 50): MemoryRecord[] {
    return this.store.searchMemory(query, limit);
  }

  delete(id: string): boolean {
    return this.store.deleteMemory(id);
  }
}

export interface SessionState {
  id: string;
  title: string;
  focus?: string;
  openFiles?: string[];
  notes?: string;
  taskIds?: string[];
}

export class SessionService {
  constructor(private readonly store: ArcStore) {}

  save(state: SessionState): SessionState {
    const now = Date.now();
    const existing = this.store.db
      .prepare("SELECT * FROM sessions WHERE id = ?")
      .get(state.id) as { created_at: number } | undefined;
    this.store.db
      .prepare(
        `INSERT INTO sessions (id, title, state, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET title = excluded.title, state = excluded.state, updated_at = excluded.updated_at`,
      )
      .run(
        state.id,
        state.title,
        JSON.stringify(state),
        existing?.created_at ?? now,
        now,
      );
    return state;
  }

  get(id: string): SessionState | undefined {
    const row = this.store.db
      .prepare("SELECT state FROM sessions WHERE id = ?")
      .get(id) as { state: string } | undefined;
    if (!row) return undefined;
    return JSON.parse(row.state) as SessionState;
  }

  list(): SessionState[] {
    const rows = this.store.db
      .prepare("SELECT state FROM sessions ORDER BY updated_at DESC")
      .all() as Array<{ state: string }>;
    return rows.map((r) => JSON.parse(r.state) as SessionState);
  }

  create(title: string, extras: Partial<SessionState> = {}): SessionState {
    return this.save({
      id: randomUUID(),
      title,
      ...extras,
    });
  }
}

export type TaskStatus = "todo" | "in_progress" | "done" | "blocked" | "cancelled";

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  description: string;
  sessionId?: string;
  createdAt: number;
  updatedAt: number;
}

export class TaskService {
  constructor(private readonly store: ArcStore) {}

  create(title: string, description = "", sessionId?: string): Task {
    const now = Date.now();
    const task: Task = {
      id: randomUUID(),
      title,
      status: "todo",
      description,
      sessionId,
      createdAt: now,
      updatedAt: now,
    };
    this.persist(task);
    return task;
  }

  update(id: string, patch: Partial<Pick<Task, "title" | "status" | "description">>): Task | undefined {
    const existing = this.get(id);
    if (!existing) return undefined;
    const next = { ...existing, ...patch, updatedAt: Date.now() };
    this.persist(next);
    return next;
  }

  get(id: string): Task | undefined {
    const row = this.store.db
      .prepare("SELECT * FROM tasks WHERE id = ?")
      .get(id) as
      | {
          id: string;
          title: string;
          status: TaskStatus;
          description: string;
          session_id: string | null;
          created_at: number;
          updated_at: number;
        }
      | undefined;
    if (!row) return undefined;
    return {
      id: row.id,
      title: row.title,
      status: row.status,
      description: row.description,
      sessionId: row.session_id ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  list(status?: TaskStatus): Task[] {
    const rows = (
      status
        ? this.store.db
            .prepare("SELECT * FROM tasks WHERE status = ? ORDER BY updated_at DESC")
            .all(status)
        : this.store.db
            .prepare("SELECT * FROM tasks ORDER BY updated_at DESC")
            .all()
    ) as Array<{
      id: string;
      title: string;
      status: TaskStatus;
      description: string;
      session_id: string | null;
      created_at: number;
      updated_at: number;
    }>;
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      description: row.description,
      sessionId: row.session_id ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  private persist(task: Task): void {
    this.store.db
      .prepare(
        `INSERT INTO tasks (id, title, status, description, session_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           status = excluded.status,
           description = excluded.description,
           session_id = excluded.session_id,
           updated_at = excluded.updated_at`,
      )
      .run(
        task.id,
        task.title,
        task.status,
        task.description,
        task.sessionId ?? null,
        task.createdAt,
        task.updatedAt,
      );
  }
}

export type DecisionStatus = "proposed" | "accepted" | "deprecated" | "superseded";

export interface Decision {
  id: string;
  title: string;
  status: DecisionStatus;
  context: string;
  decision: string;
  consequences: string;
  createdAt: number;
  updatedAt: number;
}

export class DecisionService {
  constructor(private readonly store: ArcStore) {}

  create(input: {
    title: string;
    decision: string;
    context?: string;
    consequences?: string;
    status?: DecisionStatus;
  }): Decision {
    const now = Date.now();
    const dec: Decision = {
      id: randomUUID(),
      title: input.title,
      status: input.status ?? "proposed",
      context: input.context ?? "",
      decision: input.decision,
      consequences: input.consequences ?? "",
      createdAt: now,
      updatedAt: now,
    };
    this.persist(dec);
    return dec;
  }

  get(id: string): Decision | undefined {
    const row = this.store.db
      .prepare("SELECT * FROM decisions WHERE id = ?")
      .get(id) as
      | {
          id: string;
          title: string;
          status: DecisionStatus;
          context: string;
          decision: string;
          consequences: string;
          created_at: number;
          updated_at: number;
        }
      | undefined;
    if (!row) return undefined;
    return this.fromRow(row);
  }

  list(): Decision[] {
    const rows = this.store.db
      .prepare("SELECT * FROM decisions ORDER BY updated_at DESC")
      .all() as Array<{
      id: string;
      title: string;
      status: DecisionStatus;
      context: string;
      decision: string;
      consequences: string;
      created_at: number;
      updated_at: number;
    }>;
    return rows.map((r) => this.fromRow(r));
  }

  updateStatus(id: string, status: DecisionStatus): Decision | undefined {
    const existing = this.get(id);
    if (!existing) return undefined;
    const next = { ...existing, status, updatedAt: Date.now() };
    this.persist(next);
    return next;
  }

  private fromRow(row: {
    id: string;
    title: string;
    status: DecisionStatus;
    context: string;
    decision: string;
    consequences: string;
    created_at: number;
    updated_at: number;
  }): Decision {
    return {
      id: row.id,
      title: row.title,
      status: row.status,
      context: row.context,
      decision: row.decision,
      consequences: row.consequences,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private persist(dec: Decision): void {
    this.store.db
      .prepare(
        `INSERT INTO decisions (id, title, status, context, decision, consequences, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           status = excluded.status,
           context = excluded.context,
           decision = excluded.decision,
           consequences = excluded.consequences,
           updated_at = excluded.updated_at`,
      )
      .run(
        dec.id,
        dec.title,
        dec.status,
        dec.context,
        dec.decision,
        dec.consequences,
        dec.createdAt,
        dec.updatedAt,
      );
  }
}
