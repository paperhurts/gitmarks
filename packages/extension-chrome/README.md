# @gitmarks/extension-chrome

MVP Chrome extension. Save the current tab as a bookmark to your own
GitHub repo, via a toolbar button. No native bookmark-tree integration yet
— that's a separate plan.

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
are deferred to a later plan). Pin it for easy access.

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

After loading the unpacked extension:

- [ ] Open the toolbar popup before configuring → it shows "Set up gitmarks".
- [ ] Click the setup button → options page opens in a new tab.
- [ ] Enter invalid creds (e.g., obviously bad PAT) and click **Validate**
      → red status message with a meaningful error.
- [ ] Enter valid creds and click **Validate** → green success.
- [ ] Click **Save**. Reopen the popup → it now shows "Save this page".
- [ ] Navigate to any web page, click the toolbar icon, then **Save this page**.
      → green "✓ saved" within ~2 seconds.
- [ ] Refresh the repo on github.com — `bookmarks.json` should contain
      the new entry. If this is the very first save, the file was just
      created with one bookmark.
- [ ] Save the same page again. → green "✓ saved" — a second entry with
      a different ULID and the same URL appears (dedupe is a later concern).
- [ ] Edit `bookmarks.json` manually on GitHub (add a space, commit).
      Save another page from the extension. → green "✓ saved" — the
      `update()` retry-replay loop handled the concurrent edit.

## Architecture notes

- All `chrome.*` access goes through `src/lib/{settings,machine-id}.ts`.
  Other modules are pure and unit-testable with vitest.
- The service worker is fire-and-forget per message. It re-reads
  `chrome.storage.local` on every save (service workers can be torn down
  by Chrome at any moment).
- On first save to a fresh repo, `save-flow.ts` catches
  `GitHubNotFoundError`, creates an empty `bookmarks.json`, then retries.
- URL normalization (strip trailing slash, drop non-hashbang fragments)
  happens at write time via `normalizeUrl()` from `@gitmarks/core`.

## Out of scope for this MVP

- `chrome.bookmarks.*` listeners (live sync from the native tree)
- 5-min poll loop (sync changes from other devices)
- ID-mapping table
- Folder support beyond root
- Tags UI (tags live in the JSON but no UI to edit them here yet)
- Icons (Chrome shows the default puzzle piece)
- Conflict resolution beyond core's automatic 409 retry
