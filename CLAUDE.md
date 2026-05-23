# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Two packages are merged to main and working:
- `@gitmarks/core` (`packages/core/`) — schemas, GitHub Contents API client with optimistic concurrency, ULID/URL helpers, pure mutation helpers, example fixtures. 59 unit tests.
- `@gitmarks/extension-chrome` (`packages/extension-chrome/`) — MV3 Chrome extension with toolbar save, two-way native-tree sync, 5-min poll, initial reconciliation. 53 unit tests + 6 Playwright e2e tests.

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
- **Primitives** (`src/url.ts`, `src/ulid.ts`): URL normalization (strip trailing slash, drop non-hashbang fragments) and ULID generation. Wrappers so call sites depend on `@gitmarks/core` not `ulid` directly.
- **Mutations** (`src/mutate.ts`): pure functions — `addBookmark`, `updateBookmark`, `softDeleteBookmark`, `gcTombstones`. Each takes a `BookmarksFile` and `nowIso`, returns a new file. **Purity is load-bearing** — `GitHubClient.update()` replays these on conflict, so they must not close over external state.
- **GitHub client** (`src/github/client.ts`): `GitHubClient` class with `read`, `readIfChanged` (ETag-conditional), `write` (create or update), `update` (read → mutate → write with 409/422 replay). DI fetch in the constructor for testability — no `msw` needed.

The public API is curated via `src/index.ts` (21 exports). Anything not exported is internal — never deep-import from this package.

### `@gitmarks/extension-chrome` (`packages/extension-chrome/`)

MV3 Chrome extension. Vite + `@crxjs/vite-plugin` build.

- **UI:** vanilla HTML+TS for popup and options pages. No framework.
- **Service worker** (`src/background.ts`): registers `chrome.bookmarks.*` listeners, creates the periodic poll alarm, runs initial reconciliation on cold start when stale.
- **Pure libs** (`src/lib/`):
  - `settings.ts` — Zod-validated `chrome.storage.local` wrapper
  - `machine-id.ts` — 8-char Crockford base32 ID, persisted
  - `bookmark-factory.ts` — `{url, title, machineId, nowIso}` → `Bookmark`
  - `save-flow.ts` — orchestration; on first-save 404, bootstraps with empty file then retries
  - `folder-path.ts` — tree node ↔ `"Research/AI"` path conversion
  - `id-mapping.ts` — bidirectional `{ulid: chromeNodeId}` map
  - `suppression.ts` — in-memory URL TTL map (2s) to prevent loop-back
  - `apply-remote.ts` — push a `BookmarksFile` state into `chrome.bookmarks`
  - `reconcile.ts` — merge local tree and remote file by URL on cold start
  - `listeners.ts` — `chrome.bookmarks.*` listeners with 500ms global debounce, batched flush

**Popup save vs. SW save** (architectural decision worth noting): the popup constructs its own `GitHubClient` and calls `saveBookmark` directly in the page context. The service worker handles `chrome.bookmarks.*` events and the poll alarm. The two paths don't talk via `chrome.runtime.sendMessage`. This split is intentional — it makes the popup save reliable (clear page lifecycle) and keeps the SW focused on event-driven work.

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
4. ⬜ Firefox build (`webextension-polyfill` over the same source)
5. ⬜ Web UI: list / search / tag management (Vite + React + Tailwind SPA)
6. ⬜ Web UI: bulk operations + trash + export
7. ⬜ Safari (`safari-web-extension-converter` over the Chrome bundle)

## Non-goals (do not implement)

Multi-user/shared collections, history import, thumbnails/rich previews, sub-second sync, public sharing, browser-extension-store distribution, client-side encryption, dedupe beyond exact URL match. Web UI does NOT create bookmarks (that's the extension's job on the actual page). See `spec.md` §"Non-goals" and §"What I'm explicitly NOT building".
