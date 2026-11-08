// Copy the built web UI (packages/web/dist) into an extension's dist/web/ so
// the popup can open it as an extension page. Running on the extension's
// origin, the web UI reads the extension's saved settings — no second setup.
//
// Usage: node ../../scripts/copy-web.mjs <extension dist dir>
//
// Copies index.html + assets/ only: sourcemaps and the public site's
// privacy.html don't belong in the extension package.
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webDist = resolve(here, "..", "packages", "web", "dist");
const destArg = process.argv[2];
if (destArg == null) {
  throw new Error("usage: node scripts/copy-web.mjs <extension dist dir>");
}
const dest = resolve(process.cwd(), destArg, "web");

if (!existsSync(resolve(webDist, "index.html"))) {
  throw new Error(
    `web UI not built: ${webDist} — run \`pnpm --filter @gitmarks/web build\` first ` +
      "(pnpm -r build orders it automatically via the shells' @gitmarks/web devDependency)",
  );
}

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(resolve(webDist, "index.html"), resolve(dest, "index.html"));
cpSync(resolve(webDist, "assets"), resolve(dest, "assets"), {
  recursive: true,
  filter: (src) => !src.endsWith(".map"),
});
console.log(`[${basename(resolve(process.cwd()))}] copied web UI to ${destArg}/web/`);
