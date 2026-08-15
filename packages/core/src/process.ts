import { spawn } from "node:child_process";
import { ProcessError } from "./errors.js";

export interface ExecOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  input?: string;
  shell?: boolean;
}

export interface ExecResult {
  command: string;
  args: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

/**
 * Cross-platform process execution. Avoids Bash-only assumptions.
 * On Windows, shell may be needed for .cmd shims; prefer direct binaries.
 */
export async function execCommand(
  command: string,
  args: string[] = [],
  options: ExecOptions = {},
): Promise<ExecResult> {
  const start = Date.now();
  const useShell = options.shell ?? false;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      shell: useShell,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer =
      options.timeoutMs && options.timeoutMs > 0
        ? setTimeout(() => {
            if (!settled) {
              child.kill();
              settled = true;
              reject(
                new ProcessError(command, null, stderr || "Process timed out", {
                  timeoutMs: options.timeoutMs,
                }),
              );
            }
          }, options.timeoutMs)
        : undefined;

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    if (options.input) {
      child.stdin?.write(options.input);
      child.stdin?.end();
    }

    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      if (settled) return;
      settled = true;
      reject(
        new ProcessError(command, null, err.message, {
          args,
        }),
      );
    });

    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (settled) return;
      settled = true;
      const result: ExecResult = {
        command,
        args,
        exitCode: code ?? 1,
        stdout,
        stderr,
        durationMs: Date.now() - start,
      };
      resolve(result);
    });
  });
}

export async function execOrThrow(
  command: string,
  args: string[] = [],
  options: ExecOptions = {},
): Promise<ExecResult> {
  const result = await execCommand(command, args, options);
  if (result.exitCode !== 0) {
    throw new ProcessError(command, result.exitCode, result.stderr, {
      stdout: result.stdout,
      args,
    });
  }
  return result;
}

export async function commandExists(command: string): Promise<boolean> {
  const checker = process.platform === "win32" ? "where.exe" : "which";
  try {
    const result = await execCommand(checker, [command], {
      timeoutMs: 5_000,
      shell: false,
    });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}
