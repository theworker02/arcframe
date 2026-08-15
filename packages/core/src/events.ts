type EventHandler<T = unknown> = (payload: T) => void | Promise<void>;

export class EventBus {
  private readonly handlers = new Map<string, Set<EventHandler>>();

  on<T = unknown>(event: string, handler: EventHandler<T>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as EventHandler);
    return () => this.off(event, handler);
  }

  once<T = unknown>(event: string, handler: EventHandler<T>): () => void {
    const wrap: EventHandler<T> = async (payload) => {
      off();
      await handler(payload);
    };
    const off = this.on(event, wrap);
    return off;
  }

  off<T = unknown>(event: string, handler: EventHandler<T>): void {
    this.handlers.get(event)?.delete(handler as EventHandler);
  }

  async emit<T = unknown>(event: string, payload: T): Promise<void> {
    const set = this.handlers.get(event);
    if (!set || set.size === 0) return;
    for (const handler of [...set]) {
      await handler(payload);
    }
  }

  clear(): void {
    this.handlers.clear();
  }

  listenerCount(event: string): number {
    return this.handlers.get(event)?.size ?? 0;
  }
}

export const Events = {
  INDEX_STARTED: "index:started",
  INDEX_COMPLETED: "index:completed",
  INDEX_FILE: "index:file",
  GRAPH_UPDATED: "graph:updated",
  CONFIG_CHANGED: "config:changed",
  MEMORY_WRITTEN: "memory:written",
  SESSION_CHANGED: "session:changed",
  TASK_CHANGED: "task:changed",
  HEALTH_CHECKED: "health:checked",
} as const;
