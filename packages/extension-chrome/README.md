# @gitmarks/extension-chrome

Chrome MV3 extension shell. The bulk of the implementation lives in
`@gitmarks/extension-shared`; this package owns only the Chrome-specific
manifest, Vite + `@crxjs/vite-plugin` build configuration, thin entry
files, and the Playwright e2e suite.

Functionally identical to `@gitmarks/extension-firefox` — both shells
import the same source.

## Develop

```bash
pnpm --filter @gitmarks/extension-chrome build
```

Then in Chrome:
1. Go to `chrome://extensions/`
2. Enable **Developer mode** (top right).
3. Click **Load unpacked**.
4. Select `packages/extension-chrome/dist/`.

Pin the toolbar icon for easy access.

**After changing code:** re-run the build, then on `chrome://extensions/` click
the **reload ↻** icon on the gitmarks card to pick up the new `dist/`. A plain
reload is enough for source changes; if you changed `manifest.config.ts`
(e.g. permissions), remove the extension and **Load unpacked** again so Chrome
re-prompts for the new permissions. After a reconcile-affecting change, re-save
your settings in the options page (or restart the browser) to re-trigger the
initial import.

**Other Chromium browsers (Brave, Edge, Opera, Vivaldi):** this same
`dist/` loads unchanged — no separate build. Use the equivalent
extensions page (`brave://extensions`, `edge://extensions`, …), enable
Developer mode, and **Load unpacked** the same folder. Brave Shields
don't affect the extension's own requests to `api.github.com` (those are
extension-origin, not page content).

The toolbar/extensions-page icon is generated from `assets/gitmarks.svg`
at build time (see "Icons" below).

## First-run setup

1. Create a fine-grained PAT at
   https://github.com/settings/personal-access-tokens/new. Scope it to
   **only** the repo you'll use for bookmarks, with **Contents:
   Read and write**.
2. Click the toolbar icon → "Set up gitmarks" → enter PAT, owner, repo,
   branch.
3. Optionally enable **"Strip tracking parameters"** to remove `utm_*`,
   `fbclid`, `gclid`, `msclkid`, and `mc_*` from saved URLs. Links shared
   from social posts or newsletters carry these; stripping them means the
   same article saved from two sources collapses to one bookmark, not two.
   Default off per the spec's open-question rationale (some sites use
   `utm_*` for non-tracking purposes).
4. Click **Validate**. You should see either
   "✓ valid PAT, repo exists, bookmarks.json found" or
   "✓ valid PAT, repo exists (bookmarks.json not yet created — will be on
   first save)".
5. Click **Save**.

## Uninstall

Removing the extension clears `chrome.storage.local` for this browser profile. **It does NOT revoke your GitHub PAT** — that token remains valid on github.com until you delete it manually:

1. github.com → Settings → Developer settings → Personal access tokens → Fine-grained tokens.
2. Find the token you created for gitmarks → **Delete**.

This is the authoritative way to invalidate the credential. Re-installing the extension after revoking will prompt for a fresh PAT.

## Manual smoke test

This is the **authoritative verification** that production wiring works.
The automated e2e tests (`pnpm e2e`) verify the algorithms in isolation,
but the actual `chrome.bookmarks.*` listener registration in
`background.ts` is best verified by interacting with a loaded extension.

After loading the unpacked extension and completing first-run setup:

**Popup + toolbar save (MVP path):**
- [ ] Open the toolbar popup before configuring → "Set up gitmarks".
- [ ] Click the setup button → options page opens in a new tab.
- [ ] Enter invalid creds and click **Validate** → red error.
- [ ] Enter valid creds and click **Validate** → green success.
- [ ] Click **Save**. Reopen popup → "Save this page".
- [ ] Navigate to any web page, click toolbar icon, **Save this page**
      → cyan "✓ saved" within ~2 seconds, then the popup auto-closes
      after ~1.2s. (Popup uses the web UI palette: ink bg, cyan accents,
      magenta wordmark.)
- [ ] Refresh `bookmarks.json` on github.com — the new entry is there.
- [ ] Save the same page again → second entry with a different ULID and
      same URL (dedupe is out of scope).
- [ ] Edit `bookmarks.json` manually on GitHub (add a space, commit).
      Save another page → green "✓ saved", concurrent edit handled by
      the 409 retry-replay loop.

**Save all tabs (issue #46):**
- [ ] Open a few http(s) tabs plus a `chrome://` tab in one window. Click
      the toolbar icon → **Save all tabs** (magenta button).
- [ ] Status shows `✓ saved N tabs` (N = the http(s) tabs only; the
      `chrome://` tab and any duplicate URLs are skipped, surfaced as
      `(skipped M)`), then the popup auto-closes.
- [ ] Refresh `bookmarks.json` on github.com — one batched commit adds all
      N entries under `folder: "Session YYYY-MM-DD"`.
- [ ] Click **Save all tabs** again in the same window → `✓ saved 0 tabs
      (skipped N)` (all already present; dedupe by URL).
- [ ] Note: installing now prompts for **"Read your browsing history"**
      (the `tabs` permission, required to read every tab's URL/title).

**Web UI link:**
- [ ] The popup footer shows **"Open web UI ↗"** on every state — clicking it
      opens the companion read/search/manage web UI
      (https://paperhurts.github.io/gitmarks/) in a new tab.

**Native tree sync (new in v0.2):**
- [ ] Drag any URL to your Chrome bookmarks bar. Wait ~1 second.
      Refresh `bookmarks.json` on github.com — the entry appears with
      `folder: ""` and `added_from: "chrome@<machineId>"`.
- [ ] Right-click that bookmark → Edit → change the title. Wait ~1s,
      refresh GitHub. The `title` field updates and `updated_at` advances.
- [ ] Delete the bookmark from Chrome. Refresh GitHub. The entry now
      has a `deleted_at` timestamp (soft delete; the JSON entry stays
      until GC after 30 days).
- [ ] Edit `bookmarks.json` directly on GitHub: add a new bookmark with
      a fresh ULID under `bookmarks: [...]`, commit. Within ~5 minutes
      the bookmark appears in Chrome's Bookmarks Bar without you doing
      anything.
- [ ] To trigger an immediate poll instead of waiting 5 min: visit
      `chrome://extensions/`, find gitmarks, click "service worker"
      → "Inspect views: service worker". In the DevTools console run
      `chrome.alarms.create("gitmarks:poll", { when: Date.now() + 1000 })`.
- [ ] **Import existing bookmarks on setup (issue #54):** with bookmarks
      already in Chrome, complete first-run setup. Within a few seconds (no
      restart needed), refresh `bookmarks.json` on github.com — your existing
      bookmarks are pushed up in one batched commit (`storage.onChanged` fires
      reconcile when settings are saved).
- [ ] Restart Chrome. On startup gitmarks reconciles again (and
      `runtime.onStartup`/`onInstalled` also trigger it) — bookmarks added on
      another device get pulled in.

## Architecture notes

**Sync model**
- **Local → remote (event-driven, push):** `chrome.bookmarks.onCreated`,
  `onChanged`, `onRemoved` fire on user actions. A single 500ms debounce
  batches them into one `client.update()` call.
- **Remote → local (periodic, pull):** `chrome.alarms` fires every 5
  minutes. The poll reads `bookmarks.json` with `If-None-Match` (304s
  cost nothing against the rate limit); on changes, the new entries
  are inserted into the native tree via `chrome.bookmarks.create`.
- **Reconcile triggers:** the service worker runs `reconcile()` on
  `storage.onChanged` for the settings key (setup completed / repo switched —
  forced immediately so existing bookmarks import without a restart), on
  `runtime.onInstalled` / `runtime.onStartup`, and on top-level eval. The
  eval/startup paths honor a staleness guard (`gitmarks:lastReconciledAt`
  missing or older than an hour). Reconcile
  walks both sides, links existing bookmarks by URL, pushes local-only
  to remote, pulls remote-only to local.

**Loop suppression**
When we apply a remote change to `chrome.bookmarks` (e.g., a poll pulls
in a bookmark added on another device), our own `onCreated` listener
fires — but we don't want to push it back to GitHub. Before each
`chrome.bookmarks.create / .remove` call, we register the URL in an
in-memory TTL map (`src/lib/suppression.ts`); listeners check the map
before pushing.

**ID mapping**
Chrome bookmark node IDs aren't stable across extension reinstalls. We
maintain a bidirectional `{ulid: chromeNodeId}` map in
`chrome.storage.local`. On reinstall, reconciliation re-links by URL.

**Folder convention**
- `""` → Chrome's Bookmarks Bar
- `"_other"` → Chrome's Other Bookmarks
- `"Research/AI"` → nested subfolder under Bookmarks Bar
- `"_other/Reading"` → nested subfolder under Other Bookmarks

Folder paths are derived from `chrome.bookmarks` at write time and
recreated on demand when applying remote changes. They're not stored
separately.

**Two code paths to GitHub**
- **Popup save** (`src/popup.ts`): the popup constructs its own
  `GitHubClient` and calls `saveBookmark` directly. Page-context lifecycle
  is clear and reliable.
- **Service worker save** (`src/lib/listeners.ts`, `src/lib/reconcile.ts`,
  `src/lib/apply-remote.ts`): the SW handles `chrome.bookmarks.*` events
  and the poll alarm. It uses the same `GitHubClient` against
  `bookmarks.json`.

These paths don't talk to each other directly; they both operate on
`bookmarks.json` and use the optimistic-concurrency replay loop from
`@gitmarks/core` to converge.

**Module map**

```
src/
  background.ts           # SW entry: discovers tree IDs, registers listeners,
                          # creates poll alarm, runs maybeReconcile on cold start
  popup.html / popup.ts   # popup UI; constructs GitHubClient and saves directly
  options.html / options.ts  # PAT + repo entry, validate, save
  lib/
    settings.ts           # chrome.storage.local wrapper with Zod validation
    machine-id.ts         # generate/persist 8-char Crockford base32 id
    bookmark-factory.ts   # {url, title, machineId, nowIso} → Bookmark (pure)
    save-flow.ts          # popup save orchestration; 404-bootstrap-retry path
    folder-path.ts        # tree node ↔ folder path string (pure)
    id-mapping.ts         # bidirectional ulid↔chromeNodeId persisted map
    suppression.ts        # in-memory URL TTL map for loop suppression
    apply-remote.ts       # push BookmarksFile state into chrome.bookmarks
    reconcile.ts          # initial merge of local tree + remote file
    listeners.ts          # chrome.bookmarks.* listeners + debounced flush
```

## Automated tests

```bash
# Unit tests live in the shared package (vitest, jsdom + browser.* stub)
pnpm --filter @gitmarks/extension-shared test

# Browser e2e (Playwright + real Chromium with extension loaded) is Chrome-only
pnpm --filter @gitmarks/extension-chrome e2e

# Type checking — both packages
pnpm --filter @gitmarks/extension-shared typecheck
pnpm --filter @gitmarks/extension-chrome typecheck
```

**Coverage:**

Unit tests (96) cover the pure logic — settings, machine ID, bookmark
factory, save flow, folder path conversion, ID mapping, suppression
registry (URL + node ID), apply-remote, reconciliation, the listener
batch/debounce/flush algorithm, and the background-core poll/reconcile
orchestration. Tests use a vitest setup file that stubs
`chrome.storage.local` and `chrome.bookmarks.*` with an in-memory backend.

E2e tests (4 passing, 2 skipped) launch real Chromium with the built
extension and mock the GitHub API via Playwright route interception:
- ✓ Popup before-setup → "Set up gitmarks" button visible
- ✓ Options page validate against missing `bookmarks.json` (404 path)
- ✓ `chrome.bookmarks.create` → expected PUT payload
- ✓ Remote add seeded into the mock → bookmark appears in local tree
- ⊘ Save flow via popup → GitHub PUT (skipped: depended on the dropped
  `tabs` permission fallback; the save-flow logic is fully covered by
  unit tests)
- ⊘ Popup save view after configure (same dependency, same coverage)

**Known gap (not fully understood):** during development we couldn't
reliably get `chrome.bookmarks.*` events dispatched from
`serviceWorker.evaluate()` to reach listeners registered by `background.ts`
within Playwright's default timeouts. Suspected causes: SW eviction
between test setup and event dispatch, plus the 500ms debounce window
combined with the GitHub round-trip running longer than `actionTimeout`.
The root cause wasn't fully isolated. As a workaround, the e2e sync
tests inline the equivalent algorithm into the evaluate context (where
the mocked `fetch` IS accessible — strong hint that the contexts aren't
truly isolated). The listener-debounce-flush dispatch path is verified
by unit tests; the live wiring is verified by the manual smoke test
above.

## Known limitations

**Folder-delete cascade is not handled.** When you delete a folder in
Chrome that contains synced bookmarks, `chrome.bookmarks.onRemoved` fires
for the folder node only — Chrome does not emit individual `onRemoved`
events for the children (they're gone by the time the listener fires,
and the API does not expose the just-removed subtree). The folder has
no ULID mapping (only URL-bearing nodes do), so the listener no-ops.
The bookmarks remain in remote `bookmarks.json`; on the next 5-min poll
they get re-created locally under the bookmarks bar.

**Workaround:** delete the bookmarks from GitHub directly (or via the
forthcoming web UI), or delete the bookmarks individually from Chrome
before deleting the folder.

**Why this isn't fixed in v1:** correctly cascading the delete requires
either (a) maintaining a folder→children index in `chrome.storage.local`
that's kept in sync with every reconcile + listener event, or (b)
walking the local tree on every poll to detect orphaned-on-remote
entries. Both are substantial work for a relatively rare and recoverable
user action. Filed and closed as #2.

## Out of scope

- `onMoved`-driven folder updates from listeners (next reconcile catches drift)
- Subtree-move performance optimization for thousands of bookmarks
- Tracking-param URL stripping (`utm_*`) — tracked as #6
- Folder-rename batching for thousands of bookmarks — closed as #7 (blocked on onMoved push handling)
- Tags UI (tags live in the JSON but no UI here yet — web UI scope, #24/#25)
- Conflict resolution beyond core's automatic 409/422 retry

## Icons

The toolbar button and extensions-page tile use icons generated from a
single source: `assets/gitmarks.svg` at the repo root. The `prebuild`
hook runs `scripts/gen-icons.mjs`, which rasterizes that SVG to
16/32/48/128 px PNGs into `icons/` (git-ignored) and `@crxjs/vite-plugin`
emits them into `dist/icons/`. To change the icon, edit (or replace)
`assets/gitmarks.svg` and rebuild — no manifest changes needed.
