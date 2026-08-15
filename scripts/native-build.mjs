#!/usr/bin/env node
/**
 * Build optional native accelerators when Rust/Go toolchains are present.
 * Missing toolchains are skipped (exit 0) so JS-only environments stay green.
 *
 * Usage: node ./scripts/native-build.mjs
 *        pnpm native:build
 */
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  chmodSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const binDir = join(root, "native", "bin");
const isWin = process.platform === "win32";

function log(msg) {
  console.log(`[native:build] ${msg}`);
}

function which(cmd) {
  const checker = isWin ? "where.exe" : "which";
  const r = spawnSync(checker, [cmd], { encoding: "utf8", shell: false });
  return r.status === 0;
}

function run(cmd, args, cwd, env = {}) {
  log(`$ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, {
    cwd,
    encoding: "utf8",
    stdio: "inherit",
    shell: false,
    env: { ...process.env, ...env },
  });
  return r.status === 0;
}

function copyBinary(src, destName) {
  mkdirSync(binDir, { recursive: true });
  const dest = join(binDir, destName);
  copyFileSync(src, dest);
  if (!isWin) {
    try {
      chmodSync(dest, 0o755);
    } catch {
      /* ignore */
    }
  }
  log(`installed ${dest}`);
}

mkdirSync(binDir, { recursive: true });

let built = 0;
let skipped = 0;

// --- Rust: arcframe-hashwalk ---
const rustDir = join(root, "native", "arcframe-hashwalk");
const rustTarget = join(rustDir, "target");
if (which("cargo")) {
  const cargoEnv = { CARGO_TARGET_DIR: rustTarget };
  const ok =
    run("cargo", ["build", "--release"], rustDir, cargoEnv) &&
    run("cargo", ["test"], rustDir, cargoEnv);
  if (ok) {
    const exe = isWin ? "arcframe-hashwalk.exe" : "arcframe-hashwalk";
    const src = join(rustTarget, "release", exe);
    if (existsSync(src)) {
      copyBinary(src, exe);
      built++;
    } else {
      log(`warn: expected binary missing at ${src}`);
      skipped++;
    }
  } else {
    log("warn: cargo build/test failed for arcframe-hashwalk");
    skipped++;
  }
} else {
  log("skip arcframe-hashwalk (cargo not found)");
  skipped++;
}

// --- Go: arcframe-gitmeta ---
const goDir = join(root, "native", "arcframe-gitmeta");
if (which("go")) {
  const exe = isWin ? "arcframe-gitmeta.exe" : "arcframe-gitmeta";
  const out = join(binDir, exe);
  mkdirSync(binDir, { recursive: true });
  const okTest = run("go", ["test", "./..."], goDir);
  const okBuild = run("go", ["build", "-o", out, "."], goDir);
  if (okTest && okBuild && existsSync(out)) {
    log(`installed ${out}`);
    if (!isWin) {
      try {
        chmodSync(out, 0o755);
      } catch {
        /* ignore */
      }
    }
    built++;
  } else {
    log("warn: go build/test failed for arcframe-gitmeta");
    skipped++;
  }
} else {
  log("skip arcframe-gitmeta (go not found)");
  skipped++;
}

log(`done: built=${built} skipped=${skipped}`);
log(`binaries land in ${binDir} (override discovery with ARCFRAME_NATIVE_DIR)`);
// Always succeed — native is optional
process.exit(0);
