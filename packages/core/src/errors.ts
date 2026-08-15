export class ArcframeError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ArcframeError";
    this.code = code;
    this.details = details;
  }
}

export class ConfigError extends ArcframeError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("CONFIG_ERROR", message, details);
    this.name = "ConfigError";
  }
}

export class NotInitializedError extends ArcframeError {
  constructor(root: string) {
    super(
      "NOT_INITIALIZED",
      `Arcframe is not initialized in ${root}. Run \`arc init\` first.`,
      { root },
    );
    this.name = "NotInitializedError";
  }
}

export class PermissionDeniedError extends ArcframeError {
  constructor(resource: string, reason: string) {
    super("PERMISSION_DENIED", `Permission denied for ${resource}: ${reason}`, {
      resource,
      reason,
    });
    this.name = "PermissionDeniedError";
  }
}

export class AdapterError extends ArcframeError {
  constructor(adapter: string, message: string, details?: Record<string, unknown>) {
    super("ADAPTER_ERROR", `[${adapter}] ${message}`, { adapter, ...details });
    this.name = "AdapterError";
  }
}

export class StorageError extends ArcframeError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("STORAGE_ERROR", message, details);
    this.name = "StorageError";
  }
}

export class ProcessError extends ArcframeError {
  constructor(
    command: string,
    exitCode: number | null,
    stderr: string,
    details?: Record<string, unknown>,
  ) {
    super(
      "PROCESS_ERROR",
      `Command failed (${exitCode ?? "null"}): ${command}`,
      { command, exitCode, stderr, ...details },
    );
    this.name = "ProcessError";
  }
}

export function isArcframeError(err: unknown): err is ArcframeError {
  return err instanceof ArcframeError;
}

export function formatError(err: unknown): string {
  if (isArcframeError(err)) {
    return `[${err.code}] ${err.message}`;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}
