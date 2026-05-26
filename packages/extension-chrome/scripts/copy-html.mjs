import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const shellRoot = resolve(here, "..");
const sharedHtmlDir = resolve(shellRoot, "../extension-shared/src");
const targetDir = resolve(shellRoot, "src");

if (!existsSync(sharedHtmlDir)) {
  throw new Error(`shared html dir not found: ${sharedHtmlDir}`);
}
mkdirSync(targetDir, { recursive: true });
for (const file of ["popup.html", "options.html"]) {
  copyFileSync(resolve(sharedHtmlDir, file), resolve(targetDir, file));
}
console.log("[chrome] copied popup.html + options.html from extension-shared");
