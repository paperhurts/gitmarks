import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
mkdirSync(resolve(root, "dist"), { recursive: true });
copyFileSync(
  resolve(root, "manifest.json"),
  resolve(root, "dist/manifest.json"),
);
console.log("[firefox] copied manifest.json to dist/");

// Plain Vite (root: "src") doesn't see the generated icons/ dir, so copy the
// PNGs referenced by manifest.json into dist/icons/ ourselves.
const iconsSrc = resolve(root, "icons");
const iconsDest = resolve(root, "dist/icons");
if (!existsSync(iconsSrc)) {
  throw new Error(
    `icons not found: ${iconsSrc} — run scripts/gen-icons.mjs first (prebuild does this)`,
  );
}
mkdirSync(iconsDest, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  copyFileSync(
    resolve(iconsSrc, `icon-${size}.png`),
    resolve(iconsDest, `icon-${size}.png`),
  );
}
console.log("[firefox] copied icons/ to dist/");
