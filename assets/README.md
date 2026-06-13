# assets

Source artwork for the project. Not shipped as-is — processed into per-shell
icon PNGs by `scripts/gen-icons.mjs`.

- `gitmarks.svg` — the master extension icon. A square viewBox (e.g.
  `0 0 512 512`) renders cleanest. `scripts/gen-icons.mjs` rasterizes it to
  16/32/48/128 px PNGs and writes them into each extension shell's `icons/`
  directory (which is git-ignored and regenerated on build).

Regenerate manually with:

```bash
node scripts/gen-icons.mjs
```
