import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
  dirExists,
  fileExists,
  findProjectRoot,
  getArcframePaths,
  readText,
} from "./paths.js";
import type { ProjectIdentity } from "./types.js";

function safeJson(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function detectLanguages(root: string): string[] {
  const langs = new Set<string>();
  if (
    fileExists(join(root, "tsconfig.json")) ||
    fileExists(join(root, "package.json"))
  ) {
    const pkg = safeJson(join(root, "package.json"));
    const deps = {
      ...(pkg?.dependencies as Record<string, string> | undefined),
      ...(pkg?.devDependencies as Record<string, string> | undefined),
    };
    if (deps?.typescript || fileExists(join(root, "tsconfig.json"))) {
      langs.add("typescript");
    }
    langs.add("javascript");
  }
  if (fileExists(join(root, "Cargo.toml"))) langs.add("rust");
  if (
    fileExists(join(root, "pyproject.toml")) ||
    fileExists(join(root, "requirements.txt")) ||
    fileExists(join(root, "setup.py"))
  ) {
    langs.add("python");
  }
  if (fileExists(join(root, "go.mod"))) langs.add("go");
  return [...langs];
}

function detectFrameworks(root: string): string[] {
  const frameworks = new Set<string>();
  const pkg = safeJson(join(root, "package.json"));
  const deps = {
    ...(pkg?.dependencies as Record<string, string> | undefined),
    ...(pkg?.devDependencies as Record<string, string> | undefined),
  };
  if (deps?.["next"]) frameworks.add("nextjs");
  if (deps?.["react"]) frameworks.add("react");
  if (deps?.["vue"]) frameworks.add("vue");
  if (deps?.["express"]) frameworks.add("express");
  if (deps?.["fastify"]) frameworks.add("fastify");
  if (deps?.["@nestjs/core"]) frameworks.add("nestjs");

  if (fileExists(join(root, "Cargo.toml"))) {
    try {
      const cargo = readText(join(root, "Cargo.toml"));
      if (cargo.includes("axum")) frameworks.add("axum");
      if (cargo.includes("actix-web") || cargo.includes("actix_web")) {
        frameworks.add("actix");
      }
    } catch {
      /* ignore */
    }
  }

  if (
    fileExists(join(root, "pyproject.toml")) ||
    fileExists(join(root, "requirements.txt"))
  ) {
    try {
      const py =
        (fileExists(join(root, "pyproject.toml"))
          ? readText(join(root, "pyproject.toml"))
          : "") +
        (fileExists(join(root, "requirements.txt"))
          ? readText(join(root, "requirements.txt"))
          : "");
      if (/fastapi/i.test(py)) frameworks.add("fastapi");
      if (/flask/i.test(py)) frameworks.add("flask");
      if (/django/i.test(py)) frameworks.add("django");
    } catch {
      /* ignore */
    }
  }

  return [...frameworks];
}

function detectPackageManagers(root: string): string[] {
  const pms: string[] = [];
  if (fileExists(join(root, "pnpm-lock.yaml")) || fileExists(join(root, "pnpm-workspace.yaml"))) {
    pms.push("pnpm");
  }
  if (fileExists(join(root, "yarn.lock"))) pms.push("yarn");
  if (fileExists(join(root, "package-lock.json"))) pms.push("npm");
  if (fileExists(join(root, "bun.lockb")) || fileExists(join(root, "bun.lock"))) {
    pms.push("bun");
  }
  if (fileExists(join(root, "Cargo.toml"))) pms.push("cargo");
  if (fileExists(join(root, "go.mod"))) pms.push("go");
  if (
    fileExists(join(root, "poetry.lock")) ||
    fileExists(join(root, "pyproject.toml"))
  ) {
    pms.push("pip/poetry");
  }
  return pms;
}

function detectMonorepo(root: string): boolean {
  if (fileExists(join(root, "pnpm-workspace.yaml"))) return true;
  if (dirExists(join(root, "packages")) && fileExists(join(root, "package.json"))) {
    return true;
  }
  if (fileExists(join(root, "Cargo.toml"))) {
    try {
      const cargo = readText(join(root, "Cargo.toml"));
      if (/\[workspace\]/.test(cargo)) return true;
    } catch {
      /* ignore */
    }
  }
  const pkg = safeJson(join(root, "package.json"));
  if (pkg?.workspaces) return true;
  return false;
}

export function discoverProject(cwd: string = process.cwd()): ProjectIdentity {
  const root = findProjectRoot(cwd);
  const pkg = safeJson(join(root, "package.json"));
  const name =
    (typeof pkg?.name === "string" && pkg.name) ||
    basename(root) ||
    "project";

  return {
    name,
    root,
    languages: detectLanguages(root),
    frameworks: detectFrameworks(root),
    packageManagers: detectPackageManagers(root),
    monorepo: detectMonorepo(root),
    git: dirExists(join(root, ".git")) || existsSync(join(root, ".git")),
  };
}

export function projectStatusSummary(root: string): Record<string, unknown> {
  const identity = discoverProject(root);
  const paths = getArcframePaths(identity.root);
  return {
    ...identity,
    initialized: fileExists(paths.configPath),
    arcframeDir: paths.arcframeDir,
    hasDatabase: fileExists(paths.dbPath),
  };
}
