/**
 * Sync root assets/ into app surfaces (docs, plugin, dashboard).
 * Source of truth: assets/arcframe-*
 * PNG icons must already exist (arcframe-icon-128/256.png); generate with sharp if missing.
 */
import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const assets = join(root, "assets");

if (!existsSync(join(assets, "arcframe-mark.svg"))) {
  console.error("Missing assets/arcframe-mark.svg");
  process.exit(1);
}

async function ensurePngIcons() {
  const needed = [
    join(assets, "arcframe-icon-128.png"),
    join(assets, "arcframe-icon-256.png"),
  ];
  if (needed.every((p) => existsSync(p))) return;
  const sharp = (await import("sharp")).default;
  const markSvg = readFileSync(join(assets, "arcframe-mark.svg"));
  for (const size of [128, 256]) {
    const out = join(assets, `arcframe-icon-${size}.png`);
    if (!existsSync(out)) {
      await sharp(markSvg).resize(size, size).png().toFile(out);
      console.log("generated", `assets/arcframe-icon-${size}.png`);
    }
  }
}

await ensurePngIcons();

const docsPublic = join(root, "apps", "docs", "public");
mkdirSync(docsPublic, { recursive: true });
for (const name of [
  "arcframe-mark.svg",
  "arcframe-favicon.svg",
  "arcframe-horizontal.svg",
]) {
  cpSync(join(assets, name), join(docsPublic, name));
  console.log("synced docs/public/" + name);
}

const media = join(root, "apps", "cursor-plugin", "media");
mkdirSync(media, { recursive: true });
cpSync(join(assets, "arcframe-mark.svg"), join(media, "arcframe-mark.svg"));
cpSync(join(assets, "arcframe-favicon.svg"), join(media, "arcframe-favicon.svg"));
cpSync(join(assets, "arcframe-icon-128.png"), join(media, "arcframe-icon-128.png"));
cpSync(join(assets, "arcframe-icon-256.png"), join(media, "arcframe-icon-256.png"));
cpSync(join(assets, "arcframe-mark.svg"), join(media, "icon.svg"));
console.log("synced cursor-plugin/media/*");

const dashAssets = join(root, "apps", "dashboard", "assets");
mkdirSync(dashAssets, { recursive: true });
cpSync(assets, dashAssets, { recursive: true });
console.log("synced dashboard/assets/");

console.log("brand assets synced");
