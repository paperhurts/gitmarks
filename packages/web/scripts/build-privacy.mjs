// Render docs/privacy-policy.md (the single source of truth) into
// dist/privacy.html so the Pages deploy serves it at /privacy.html — the
// URL the Chrome Web Store / AMO listings point at. Runs as postbuild.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";

const here = dirname(fileURLToPath(import.meta.url));
const mdPath = resolve(here, "../../../docs/privacy-policy.md");
const outPath = resolve(here, "../dist/privacy.html");

if (!existsSync(mdPath)) throw new Error(`privacy policy source not found: ${mdPath}`);
if (!existsSync(dirname(outPath))) throw new Error(`dist/ not found — run vite build first`);

const body = marked.parse(readFileSync(mdPath, "utf8"), { async: false });

// Palette mirrors the web UI (tailwind.config.ts):
// ink #0a0a0f, mist #16161e, fog #23232e, cyan #22d3ee, magenta #e879f9.
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'self'" />
<title>gitmarks — privacy policy</title>
<style>
  :root { color-scheme: dark; }
  body {
    font-family: ui-monospace, "JetBrains Mono", SFMono-Regular, Menlo, monospace;
    max-width: 720px;
    margin: 2rem auto 4rem;
    padding: 0 1rem;
    color: #e5e7eb;
    background: #0a0a0f;
    line-height: 1.6;
  }
  h1 { color: #e879f9; font-size: 1.6rem; letter-spacing: 0.02em; }
  h2 { color: #22d3ee; font-size: 1.15rem; margin-top: 2rem; }
  a { color: #22d3ee; }
  a:hover { color: #67e8f9; }
  code { background: #16161e; padding: 0.1em 0.35em; border-radius: 4px; font-size: 0.9em; }
  table { border-collapse: collapse; width: 100%; font-size: 0.85rem; display: block; overflow-x: auto; }
  th, td { border: 1px solid #23232e; padding: 0.5rem 0.65rem; text-align: left; }
  th { background: #16161e; }
  footer { margin-top: 3rem; font-size: 0.8rem; color: #9ca3af; border-top: 1px solid #23232e; padding-top: 1rem; }
</style>
</head>
<body>
${body}
<footer><a href="./">← gitmarks web UI</a> · <a href="https://github.com/paperhurts/gitmarks">source on GitHub</a></footer>
</body>
</html>
`;

writeFileSync(outPath, html);
console.log("[web] rendered privacy policy to dist/privacy.html");
