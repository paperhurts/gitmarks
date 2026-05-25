# @gitmarks/web

Static SPA for browsing and tagging your gitmarks. Vite + React + Tailwind.
Reads `bookmarks.json` and `tags.json` directly from GitHub via the Contents
API; no server.

## Develop

```bash
pnpm --filter @gitmarks/web dev
```

The dev server runs at `http://localhost:5173/`. Hash routes:

- `#/setup` — PAT + owner + repo + branch entry, with a Validate step
- `#/` — list page (search + tag filter sidebar)
- `#/tags` — tag manager (rename, recolor, add, delete)
- `#/trash` — soft-deleted bookmarks within the 30-day GC window, with restore

On first load with no settings stored, the router redirects to `#/setup`.

## Build

```bash
pnpm --filter @gitmarks/web build
```

The output lands in `packages/web/dist/`. `base: "./"` is set so the build
works under any path — drop the folder onto GitHub Pages or Cloudflare Pages.

## Manual smoke test

After running `pnpm --filter @gitmarks/web dev`:

- [ ] Open `http://localhost:5173/` — the app redirects to `#/setup`.
- [ ] Enter a valid fine-grained PAT (Contents: read/write on your bookmarks
      repo), owner, repo, branch. Click **Validate** → green confirmation.
- [ ] Click **Save** → the app redirects to the list view.
- [ ] If the repo has bookmarks, they render with tag chips and folder labels.
- [ ] Type in the search box — the list filters live.
- [ ] Click a tag in the sidebar — only bookmarks with that tag remain.
      Click the same tag again to clear the filter.
- [ ] Click **Sync from GitHub** — the status pill briefly says "Syncing…"
      then returns to the bookmark count. If you edit `bookmarks.json`
      directly on github.com first, the new entry appears after the sync.
- [ ] Open `#/tags`. Rename a tag, change its color, add a new tag, delete
      a tag. Each action commits to `tags.json` immediately. Refresh the
      page and confirm the changes persisted.
- [ ] Select multiple rows via their checkboxes → the BulkActionsBar appears with
      the count + add-tag/remove-tag/set-folder/move-to-trash/clear actions.
- [ ] Add a tag via the bar → all selected rows show the new tag. One commit
      lands on `bookmarks.json`.
- [ ] Move several rows to trash → they disappear from the list, the BulkActionsBar
      clears, and the entries get `deleted_at` set on GitHub.
- [ ] Open `#/trash` → the moved rows are listed. Click **Restore** on one →
      it disappears from trash and reappears in the list. One commit lands.
- [ ] Click **Export** in the header → a file `gitmarks.html` downloads. Open
      it in another browser's bookmark-import → the bookmarks appear, folders
      nested correctly. Tombstones are not exported.

## Scope (v1 + v2)

Read + write side. Bookmark creation still happens via the extension (per
spec); the web UI does NOT create bookmarks.

Web UI scope, today:
- List + search + tag filter
- Tag manager (rename / recolor / add / delete)
- Multi-select + bulk operations (add tag, remove tag, set folder, move to trash)
- Trash view with restore
- Netscape HTML export

## Architecture

```
src/
  main.tsx                # React entry
  App.tsx                 # RouterProvider; settings gate via <RequireSettings/>
  index.css               # Tailwind directives
  lib/
    settings.ts           # localStorage wrapper with Zod validation
    client.ts             # GitHubClient factory + validateConnection
    data.ts               # pure helpers: visibleBookmarks, searchBookmarks, allUsedTags
    tag-mutations.ts      # pure helpers: addTag/renameTag/setTagColor/deleteTag
  hooks/
    useGitmarksData.ts    # loads both files with ETag; refresh + writeTags
  components/
    Layout.tsx, SetupForm.tsx, BookmarkList.tsx, BookmarkRow.tsx,
    TagChip.tsx, SearchBar.tsx, TagFilter.tsx, TagManager.tsx
  routes/
    SetupPage.tsx, ListPage.tsx, TagsPage.tsx
```

Page-level components own data + state; the dumb components take props and
emit callbacks. Writes go through `client.update()` from `@gitmarks/core`,
which transparently handles 409 retry-replay.

## Deploying to GitHub Pages

```bash
pnpm --filter @gitmarks/web build
# Copy packages/web/dist/ into the gh-pages branch of any repo, or use the
# `gh-pages` npm package to push.
```

Because `base: "./"` is set, the build works at any path.
