export type ServiceFactory<T> = (container: ServiceContainer) => T;

export class ServiceContainer {
  private readonly factories = new Map<string, ServiceFactory<unknown>>();
  private readonly singletons = new Map<string, unknown>();
  private readonly singletonFlags = new Set<string>();

  register<T>(
    id: string,
    factory: ServiceFactory<T>,
    options: { singleton?: boolean } = {},
  ): void {
    this.factories.set(id, factory as ServiceFactory<unknown>);
    if (options.singleton !== false) {
      this.singletonFlags.add(id);
    }
  }

  registerValue<T>(id: string, value: T): void {
    this.singletons.set(id, value);
    this.singletonFlags.add(id);
    this.factories.set(id, () => value);
  }

  has(id: string): boolean {
    return this.factories.has(id) || this.singletons.has(id);
  }

  resolve<T>(id: string): T {
    if (this.singletons.has(id)) {
      return this.singletons.get(id) as T;
    }
    const factory = this.factories.get(id);
    if (!factory) {
      throw new Error(`Service not registered: ${id}`);
    }
    const value = factory(this) as T;
    if (this.singletonFlags.has(id)) {
      this.singletons.set(id, value);
    }
    return value;
  }

  tryResolve<T>(id: string): T | undefined {
    if (!this.has(id)) return undefined;
    return this.resolve<T>(id);
  }

  clear(): void {
    this.factories.clear();
    this.singletons.clear();
    this.singletonFlags.clear();
  }
}

export const ServiceIds = {
  ROOT: "root",
  CONFIG: "config",
  LOGGER: "logger",
  CACHE: "cache",
  EVENTS: "events",
  STORAGE: "storage",
  PATHS: "paths",
  PERMISSIONS: "permissions",
  CAPABILITIES: "capabilities",
} as const;
