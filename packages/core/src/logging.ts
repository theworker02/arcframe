import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { LogLevel } from "./types.js";

const LEVEL_ORDER: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

export interface LoggerOptions {
  level?: LogLevel;
  name?: string;
  logDir?: string;
  json?: boolean;
  silent?: boolean;
}

export interface Logger {
  level: LogLevel;
  child(name: string): Logger;
  trace(msg: string, meta?: Record<string, unknown>): void;
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  fatal(msg: string, meta?: Record<string, unknown>): void;
}

class ArcframeLogger implements Logger {
  level: LogLevel;
  private readonly name: string;
  private readonly logDir?: string;
  private readonly json: boolean;
  private readonly silent: boolean;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? "info";
    this.name = options.name ?? "arcframe";
    this.logDir = options.logDir;
    this.json = options.json ?? false;
    this.silent = options.silent ?? false;
  }

  child(name: string): Logger {
    return new ArcframeLogger({
      level: this.level,
      name: `${this.name}:${name}`,
      logDir: this.logDir,
      json: this.json,
      silent: this.silent,
    });
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_ORDER[level] >= LEVEL_ORDER[this.level];
  }

  private write(level: LogLevel, msg: string, meta?: Record<string, unknown>): void {
    if (!this.shouldLog(level) || this.silent) return;

    const ts = new Date().toISOString();
    const line = this.json
      ? JSON.stringify({ ts, level, name: this.name, msg, ...meta })
      : `${ts} ${level.toUpperCase().padEnd(5)} [${this.name}] ${msg}${
          meta ? ` ${JSON.stringify(meta)}` : ""
        }`;

    const stream =
      LEVEL_ORDER[level] >= LEVEL_ORDER.error ? process.stderr : process.stdout;
    stream.write(line + "\n");

    if (this.logDir) {
      try {
        if (!existsSync(this.logDir)) {
          mkdirSync(this.logDir, { recursive: true });
        }
        const file = join(this.logDir, "arcframe.log");
        appendFileSync(file, line + "\n", "utf8");
      } catch {
        // ignore disk logging failures
      }
    }
  }

  trace(msg: string, meta?: Record<string, unknown>): void {
    this.write("trace", msg, meta);
  }
  debug(msg: string, meta?: Record<string, unknown>): void {
    this.write("debug", msg, meta);
  }
  info(msg: string, meta?: Record<string, unknown>): void {
    this.write("info", msg, meta);
  }
  warn(msg: string, meta?: Record<string, unknown>): void {
    this.write("warn", msg, meta);
  }
  error(msg: string, meta?: Record<string, unknown>): void {
    this.write("error", msg, meta);
  }
  fatal(msg: string, meta?: Record<string, unknown>): void {
    this.write("fatal", msg, meta);
  }
}

let rootLogger: Logger = new ArcframeLogger();

export function createLogger(options?: LoggerOptions): Logger {
  return new ArcframeLogger(options);
}

export function getLogger(): Logger {
  return rootLogger;
}

export function setRootLogger(logger: Logger): void {
  rootLogger = logger;
}
