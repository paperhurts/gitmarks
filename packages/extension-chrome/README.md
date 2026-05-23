# @gitmarks/extension-chrome

Chrome MV3 extension. Save bookmarks to your own GitHub repo, and keep
Chrome's native bookmark tree in two-way sync with the JSON file.

## Develop

```bash
pnpm --filter @gitmarks/extension-chrome build
```

Then in Chrome:
1. Go to `chrome://extensions/`
2. Enable **Developer mode** (top right).
3. Click **Load unpacked**.
4. Select `packages/extension-chrome/dist/`.

The extension's toolbar icon appears as a default puzzle piece (icons
are deferred). Pin it for easy access.

## First-run setup

1. Create a fine-grained PAT at
   https://github.com/settings/personal-access-tokens/new. Scope it to
   **only** the repo you'll use for bookmarks, with **Contents:
   Read and write**.
2. Click the toolbar icon → "Set up gitmarks" → enter PAT, owner, repo,
   branch.
3. Click **Validate**. You should see either
   "✓ valid PAT, repo exists, bookmarks.json found" or
   "✓ valid PAT, repo exists (bookmarks.json not yet created — will be on
   first save)".
4. Click **Save**.

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
      → green "✓ saved" within ~2 seconds.
- [ ] Refresh `bookmarks.json` on github.com — the new entry is there.
- [ ] Save the same page again → second entry with a different ULID and
      same URL (dedupe is out of scope).
- [ ] Edit `bookmarks.json` manually on GitHub (add a space, commit).
      Save another page → green "✓ saved", concurrent edit handled by
      the 409 retry-replay loop.

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
- [ ] Restart Chrome. On cold start, gitmarks runs initial reconciliation
      if more than an hour has elapsed since the last one — bookmarks
      added on another device get pulled in.

## Architecture notes

**Sync model**
- **Local → remote (event-driven, push):** `chrome.bookmarks.onCreated`,
  `onChanged`, `onRemoved` fire on user actions. A single 500ms debounce
  batches them into one `client.update()` call.
- **Remote → local (periodic, pull):** `chrome.alarms` fires every 5
  minutes. The poll reads `bookmarks.json` with `If-None-Match` (304s
  cost nothing against the rate limit); on changes, the new entries
  are inserted into the native tree via `chrome.bookmarks.create`.
- **Cold start:** the service worker runs `reconcile()` if
  `gitmarks:lastReconciledAt` is missing or older than an hour. Reconcile
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
# Unit tests (vitest, jsdom + chrome.* stub)
pnpm --filter @gitmarks/extension-chrome test

# Browser e2e (Playwright + real Chromium with extension loaded)
pnpm --filter @gitmarks/extension-chrome e2e

# Type checking
pnpm --filter @gitmarks/extension-chrome typecheck
```

**Coverage:**

Unit tests (53) cover the pure logic — settings, machine ID, bookmark
factory, save flow, folder path conversion, ID mapping, suppression
registry, apply-remote, reconciliation, and the listener
batch/debounce/flush algorithm. Tests use a vitest setup file that stubs
`chrome.storage.local` and `chrome.bookmarks.*` with an in-memory backend.

E2e tests (6) launch real Chromium with the built extension, mock the
GitHub API via Playwright route interception, and exercise:
- Popup before-setup → "Set up gitmarks" button visible
- Options page validate + save flow with the mocked API
- "Save this page" round-trip → mocked GitHub receives the PUT
- `chrome.bookmarks.create` → expected PUT payload
- Remote add seeded into the mock → bookmark appears in local tree

**Known limitation:** Playwright 1.x's `serviceWorker.evaluate()` runs in
a V8 context isolated from the extension's `background.ts` module scope.
Chrome events dispatched from `evaluate()` don't reach the listeners
registered by the module. The e2e sync tests inline the equivalent
algorithm into the evaluate context where the mocked `fetch` is
accessible; the actual listener-debounce-flush dispatch path in
`background.ts` is verified by the unit tests and by the manual smoke
test above.

## Out of scope

- `onMoved`-driven folder updates from listeners (next reconcile catches drift)
- Subtree-move performance optimization for thousands of bookmarks
- Tracking-param URL stripping (`utm_*`)
- Folder-rename batching for thousands of bookmarks
- Tags UI (tags live in the JSON but no UI here yet — web UI scope)
- Icons (Chrome shows the default puzzle piece)
- Conflict resolution beyond core's automatic 409/422 retry
