# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Two packages are merged to main and working:
- `@gitmarks/core` (`packages/core/`) — schemas, GitHub Contents API client with optimistic concurrency, ULID/URL helpers (incl. opt-in tracking-param stripping), pure mutation helpers, example fixtures. 65 unit tests.
- `@gitmarks/extension-shared` (`packages/extension-shared/`) — canonical owner of the cross-browser extension code: popup, options, background, all of `src/lib/`, and the chrome/browser stub. 96 unit tests live here. Consumed by both browser shells via `workspace:*`. Uses `browser.*` via `webextension-polyfill`.
- `@gitmarks/extension-chrome` (`packages/extension-chrome/`) — Chrome MV3 shell. Manifest + Vite/crxjs build + Playwright e2e (4 passing, 2 skipped — see issue history for the activeTab/Playwright limitation). Source files are thin entries that re-export from `extension-shared` via its `exports` map.
- `@gitmarks/extension-firefox` (`packages/extension-firefox/`) — Firefox MV3 shell. Manifest + plain Vite build + manual smoke test (Playwright Firefox doesn't reliably drive WebExtensions). Targets Firefox 121+ for MV3 SW parity. Load via `about:debugging` → "Load Temporary Add-on".

Pending packages (in dependency order): Firefox build, web UI (read + search + tags), web UI (write + bulk ops), Safari.

`spec.md` remains the source of truth for design decisions that aren't visible in the code.

## What this is

`gitmarks` is a serverless cross-browser bookmark sync system. Architecture: browser extensions and a web UI both talk directly to the GitHub Contents API, reading and writing a `bookmarks.json` / `tags.json` pair in the user's own private repo. No server, no backend.

## Load-bearing invariants

These are spec-level constraints; don't violate without an explicit discussion:

- **No server, ever.** Clients talk to GitHub REST API directly. PAT lives client-side (`chrome.storage.local`, `localStorage`).
- **The user's private GitHub repo is the single source of truth.** Git history is the audit log. No client-side encryption (would defeat human-readable history).
- **Optimistic concurrency** via GitHub file SHA. 409/422 → refetch → replay mutation → retry (up to 3, exponential backoff). Soft deletes (tombstones, GC'd after 30 days) eliminate most conflicts.
- **Sync model:** event-driven push for local changes (500ms debounce, batched), 5-minute poll for remote (`chrome.alarms` + `If-None-Match` so 304s don't burn rate limit).
- **IDs are ULIDs generated client-side.** Native browser node IDs are not stable across reinstalls — the extension maintains a `{ulid: chrome_node_id}` map in `chrome.storage.local`, rebuilt by URL match.
- **Folder ↔ string path:** `Bookmarks Bar` ↔ `""` (root), `Other Bookmarks` ↔ `"_other"`, nested folders joined with `/`. Folder structure is derived from bookmarks, not stored separately.
- **Loop suppression:** when applying a remote change to `chrome.bookmarks`, register the URL in an in-memory TTL map for ~2s so our own listener doesn't echo it back to GitHub.

## Architecture by package

### `@gitmarks/core` (`packages/core/`)

Pure TypeScript ESM library. No browser APIs, no React. Three layers:

- **Schemas** (`src/schema/`): Zod schemas for `bookmarks.json` and `tags.json`. Inferred types (`Bookmark`, `BookmarksFile`, `Tag`, `TagsFile`).
- **Primitives** (`src/url.ts`, `src/ulid.ts`): URL normalization (strip trailing slash, drop non-hashbang fragments, optionally strip utm_*/fbclid/gclid/msclkid/mc_* tracking params via `{ stripTrackingParams: true }`) and ULID generation. Wrappers so call sites depend on `@gitmarks/core` not `ulid` directly.
- **Mutations** (`src/mutate.ts`): pure functions — `addBookmark`, `updateBookmark`, `softDeleteBookmark`, `gcTombstones`. Each takes a `BookmarksFile` and `nowIso`, returns a new file. **Purity is load-bearing** — `GitHubClient.update()` replays these on conflict, so they must not close over external state.
- **GitHub client** (`src/github/client.ts`): `GitHubClient` class with `read`, `readIfChanged` (ETag-conditional), `write` (create or update), `update` (read → mutate → write with 409/422 replay). DI fetch in the constructor for testability — no `msw` needed.

The public API is curated via `src/index.ts` (21 exports). Anything not exported is internal — never deep-import from this package.

### `@gitmarks/extension-shared` (`packages/extension-shared/`)

Cross-browser source — owns all popup, options, background, and `src/lib/` modules. Both browser shells import from here via the `exports` map (`./background`, `./popup`, `./options`). Uses `browser.*` via `webextension-polyfill`. No framework — vanilla HTML+TS.

- **Service worker** (`src/background.ts`): registers `browser.bookmarks.*` listeners, creates the periodic poll alarm, runs initial reconciliation on cold start when stale.
- **Pure libs** (`src/lib/`):
  - `settings.ts` — Zod-validated `browser.storage.local` wrapper
  - `machine-id.ts` — 8-char Crockford base32 ID, persisted
  - `bookmark-factory.ts` — `{url, title, machineId, nowIso, stripTrackingParams?}` → `Bookmark`
  - `save-flow.ts` — orchestration; on first-save 404, bootstraps with empty file then retries
  - `folder-path.ts` — tree node ↔ `"Research/AI"` path conversion
  - `id-mapping.ts` — bidirectional `{ulid: chromeNodeId}` map
  - `suppression.ts` — in-memory URL + nodeId TTL maps (2s) to prevent loop-back
  - `apply-remote.ts` — push a `BookmarksFile` state into `browser.bookmarks`
  - `reconcile.ts` — merge local tree and remote file by URL on cold start
  - `listeners.ts` — `browser.bookmarks.*` listeners with 500ms global debounce, batched flush
  - `background-core.ts` — dependency-injected `runMaybeReconcile` and `runPollRemoteOnce` (testable orchestration extracted from the SW entry)
  - `bookmarks-file.ts` — `BOOKMARKS_PATH` + `updateBookmarksOrBootstrap` shared by save-flow, listeners, reconcile

**Popup save vs. SW save** (architectural decision worth noting): the popup constructs its own `GitHubClient` and calls `saveBookmark` directly in the page context. The service worker handles `browser.bookmarks.*` events and the poll alarm. The two paths don't talk via `browser.runtime.sendMessage`. This split is intentional — it makes the popup save reliable (clear page lifecycle) and keeps the SW focused on event-driven work.

### `@gitmarks/extension-chrome` and `@gitmarks/extension-firefox` (shells)

Each is a thin browser-specific shell over `@gitmarks/extension-shared`:
- Own manifest (Chrome: TS via `@crxjs/vite-plugin defineManifest`; Firefox: literal `manifest.json` copied into `dist/` post-build by `scripts/copy-manifest.mjs`)
- Own Vite config (Chrome: `crx({manifest})` plugin; Firefox: plain multi-entry with `root: "src"` + `outDir: "../dist"`)
- Own entry files that side-effect-import from `@gitmarks/extension-shared/{background,popup,options}`
- Own HTML files (duplicated across shells because Vite needs them as build inputs — known follow-up)
- Chrome owns the Playwright e2e suite; Firefox relies on the manual smoke test in its README

## Testing

- **Unit tests** (`packages/*/test/*.test.ts`): Vitest. The extension package uses jsdom + a `chrome.*` stub at `test/setup.ts` for tests that touch the chrome API. Pure logic is unit-tested in isolation.
- **Browser e2e** (`packages/extension-chrome/e2e/*.spec.ts`): Playwright with persistent context, loads the built `dist/` as an unpacked extension into a real Chromium. GitHub API is mocked via `page.route()`. Verifies popup + options + native chrome.bookmarks API integration.
- **Manual smoke test:** `packages/extension-chrome/README.md` has the checklist for verifying the full production wiring in a real browser session.

**Known Playwright gap (not fully understood):** during development we couldn't reliably get `chrome.bookmarks.*` events dispatched from `serviceWorker.evaluate()` to reach listeners registered by `background.ts` within the test timeout. The likely culprits are SW eviction between setup and event dispatch, and the 500ms debounce + GitHub round-trip exceeding Playwright's default `actionTimeout`. The root cause wasn't fully isolated. The e2e tests work around it by inlining the equivalent algorithm into the evaluate context (where the mocked `fetch` is available); the listener-debounce-flush dispatch path is unit-tested separately, and the production wiring is verified by the manual smoke test in `packages/extension-chrome/README.md`. A future investigation could revisit this — `globalThis.fetch` IS shared between the evaluate context and the module, which strongly suggests the V8 contexts aren't truly isolated.

## Build commands

```bash
# All packages
pnpm install
pnpm test
pnpm typecheck
pnpm build

# Single package
pnpm --filter @gitmarks/core test
pnpm --filter @gitmarks/extension-chrome e2e
```

## Roadmap (in dependency order)

1. ✅ `@gitmarks/core`
2. ✅ Chrome MVP (toolbar save)
3. ✅ Chrome native tree integration
4. ✅ Firefox MV3 add-on (`webextension-polyfill` + extension-shared) — issue [#23](https://github.com/paperhurts/gitmarks/issues/23)
5. ⬜ Web UI v1: list / search / tag management — issue [#24](https://github.com/paperhurts/gitmarks/issues/24)
6. ⬜ Web UI v2: bulk operations + trash + export — issue [#25](https://github.com/paperhurts/gitmarks/issues/25)
7. ⬜ Safari (`safari-web-extension-converter`) — issue [#26](https://github.com/paperhurts/gitmarks/issues/26)

For next-piece-of-work: pick one of #23–#26. Each has a scope block in its issue description. The plan-driven workflow (`docs/superpowers/plans/YYYY-MM-DD-<feature>.md`) is the expected approach for anything larger than ~3 commits.

## Non-goals (do not implement)

Multi-user/shared collections, history import, thumbnails/rich previews, sub-second sync, public sharing, browser-extension-store distribution, client-side encryption, dedupe beyond exact URL match. Web UI does NOT create bookmarks (that's the extension's job on the actual page). See `spec.md` §"Non-goals" and §"What I'm explicitly NOT building".
