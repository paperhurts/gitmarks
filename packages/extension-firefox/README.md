# @gitmarks/extension-firefox

Firefox MV3 add-on. Save bookmarks to your own GitHub repo + two-way
sync with the native bookmark tree. Functionally identical to the Chrome
extension — both load the same code from `@gitmarks/extension-shared`.

## Develop

```bash
pnpm --filter @gitmarks/extension-firefox build
```

Then in Firefox 121+:

1. Go to `about:debugging` → click **This Firefox**.
2. Click **Load Temporary Add-on…**.
3. Select `packages/extension-firefox/dist/manifest.json`.

The add-on loads as temporary — it'll be removed when you quit Firefox.
For permanent installation you'd need to sign with AMO (deferred per
`spec.md` — ship as developer-mode unpacked first; do AMO review later
if usage justifies it).

## First-run setup

Identical to Chrome — see `packages/extension-chrome/README.md`
"First-run setup". The popup, options page, PAT validation, and the
optional **Strip tracking parameters** toggle all behave the same.

## Uninstall

Removing the add-on clears its extension-local storage for this Firefox profile. **It does NOT revoke your GitHub PAT** — that token remains valid on github.com until you delete it manually:

1. github.com → Settings → Developer settings → Personal access tokens → Fine-grained tokens.
2. Find the token you created for gitmarks → **Delete**.

This is the authoritative way to invalidate the credential.

## Manual smoke test

The unit test suite (`pnpm --filter @gitmarks/extension-shared test`,
96 tests) covers all the shared logic that runs in both browsers. The
Firefox-specific pieces (manifest, build output, runtime behavior in
Firefox's WebExtensions runtime, native `browser.*` vs the polyfilled
version Chrome uses) need a manual check:

**Load + popup:**

- [ ] Build, load via `about:debugging` → "Load Temporary Add-on", select
      `dist/manifest.json`. The gitmarks toolbar icon (generated from
      `assets/gitmarks.svg` at build time) appears; pin it for easy
      access.
- [ ] Click the icon before configuring → popup shows "Set up gitmarks".

**Setup flow:**

- [ ] Click "Set up gitmarks" → options page opens in a new tab.
- [ ] Enter PAT + owner + repo + branch + click Validate. Both green
      success outcomes (file exists / file 404-but-repo-found) should
      behave identically to the Chrome flow.
- [ ] (Optional) Check "Strip tracking parameters" and Save.

**Save flow:**

- [ ] Navigate to any page, click the toolbar icon → "Save this page".
      Cyan "✓ saved" within ~2s, then the popup auto-closes after ~1.2s
      (popup uses the web UI palette). Refresh `bookmarks.json` on
      github.com — the new entry appears with `added_from: "chrome@<id>"`.
      (The `chrome@` prefix is intentional — the polyfill exposes the
      same `browser.*` namespace, but the machine-id helper writes the
      prefix that the Chrome extension uses too. We may revisit this if
      cross-browser disambiguation matters; for now, all `added_from`
      values carry `chrome@` regardless of browser.)

**Native tree sync:**

- [ ] Drag any URL to the bookmarks toolbar. Within ~1 second the entry
      appears in `bookmarks.json` on GitHub.
- [ ] Right-click the bookmark in Firefox → Edit → change the title.
      The remote `title` updates within ~1 second.
- [ ] Delete the bookmark in Firefox. The remote entry gets a
      `deleted_at` timestamp (soft delete).
- [ ] Edit `bookmarks.json` directly on GitHub: add a new entry with a
      fresh ULID, commit. Within 5 minutes the bookmark appears in
      Firefox's bookmarks tree.

**Trigger an immediate poll** (instead of waiting 5 min):

1. `about:debugging` → click **Inspect** on the gitmarks add-on.
2. Open the Console tab.
3. Run: `browser.alarms.create("gitmarks:poll", { when: Date.now() + 1000 })`.

## Known limitations

Same as the Chrome extension — see the "Known limitations" section in
`packages/extension-chrome/README.md`. Notably:

- Folder-delete cascade not handled (issue #2; documented).
- Cross-browser e2e isn't automated. Playwright's Firefox driver has
  spotty WebExtensions support, especially for service workers; the
  shared unit suite covers the algorithms and this manual smoke test
  covers the wiring.

## Architecture

`@gitmarks/extension-firefox` is a thin shell. The full implementation
lives in `@gitmarks/extension-shared`:

```
packages/
├── core/                        # GitHub client, schemas, mutations
├── extension-shared/            # cross-browser source (this is the brain)
│   ├── src/background.ts        # SW: listeners + alarm + reconcile
│   ├── src/popup.ts             # popup UI + popup-direct save flow
│   ├── src/options.ts           # PAT/repo/branch + strip-tracking-params
│   └── src/lib/                 # 12 pure-ish modules
├── extension-chrome/            # Chrome shell (manifest + vite-crxjs + e2e)
└── extension-firefox/           # this package: Firefox shell
    ├── manifest.json            # MV3, gecko id, strict_min_version 121.0
    ├── vite.config.ts           # plain Vite multi-entry (no crxjs)
    ├── scripts/copy-manifest.mjs # copies manifest.json into dist/
    └── src/
        ├── background.ts        # → @gitmarks/extension-shared/background
        ├── popup.ts             # → @gitmarks/extension-shared/popup
        ├── popup.html
        ├── options.ts           # → @gitmarks/extension-shared/options
        └── options.html
```

`webextension-polyfill` lets the shared source use `browser.*`
uniformly. Chrome's `chrome.*` is auto-aliased by the polyfill; Firefox
exposes `browser.*` natively.
