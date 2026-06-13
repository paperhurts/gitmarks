// Rasterize assets/gitmarks.svg into per-shell extension icon PNGs.
//
// Single source of truth: assets/gitmarks.svg. The generated PNGs are
// git-ignored and recreated on each build (the shells' `prebuild` runs this).
// Uses @resvg/resvg-js (prebuilt binary, no system ImageMagick/librsvg needed).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const source = resolve(root, "assets/gitmarks.svg");

const SIZES = [16, 32, 48, 128];
const SHELL_ICON_DIRS = [
  resolve(root, "packages/extension-chrome/icons"),
  resolve(root, "packages/extension-firefox/icons"),
];

if (!existsSync(source)) {
  throw new Error(
    `icon source not found: ${source}\n` +
      `Drop a square SVG at assets/gitmarks.svg (see assets/README.md), then re-run.`,
  );
}

const svg = readFileSync(source);

for (const dir of SHELL_ICON_DIRS) {
  mkdirSync(dir, { recursive: true });
  for (const size of SIZES) {
    // Render at the target raster width so each size is crisp, not downscaled
    // from one bitmap.
    const png = new Resvg(svg, {
      fitTo: { mode: "width", value: size },
    })
      .render()
      .asPng();
    writeFileSync(resolve(dir, `icon-${size}.png`), png);
  }
}

console.log(
  `[icons] generated ${SIZES.join("/")} px PNGs into ${SHELL_ICON_DIRS.length} shells`,
);
