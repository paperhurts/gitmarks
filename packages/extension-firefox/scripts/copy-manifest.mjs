import { copyFileSync, mkdirSync } from "node:fs";
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
