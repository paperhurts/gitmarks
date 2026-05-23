# @gitmarks/core

Shared library for the gitmarks browser extensions and web UI. Owns the
JSON schemas, the GitHub Contents API client, and pure helpers for mutating
the bookmark file.

This package does not know about `chrome.bookmarks`, React, or the DOM.
All browser-specific code lives in `packages/extension-*` and `packages/web`.

## Schemas

`bookmarksFileSchema` and `tagsFileSchema` are Zod schemas. Their inferred
types are exported as `BookmarksFile` and `TagsFile`.

```ts
import { bookmarksFileSchema, type BookmarksFile } from "@gitmarks/core";

const data: BookmarksFile = bookmarksFileSchema.parse(jsonFromGitHub);
```

## GitHub client

```ts
import { GitHubClient, type BookmarksFile } from "@gitmarks/core";

const client = new GitHubClient({
  owner: "alice",
  repo: "bookmarks",
  token: pat,
});

// Read with ETag for cheap polling
const first = await client.read<BookmarksFile>("bookmarks.json");
const maybe = await client.readIfChanged<BookmarksFile>(
  "bookmarks.json",
  first.etag,
);
// `maybe` is null if the file hasn't changed.

// Optimistic-concurrent update
const result = await client.update<BookmarksFile>(
  "bookmarks.json",
  (current) => addBookmark(current, newBookmark, new Date().toISOString()),
  "add bookmark from chrome@minerva",
);
```

`update()` reads the file, calls `mutate` on the latest data, and writes.
On a 409 it re-reads and replays `mutate` against the fresh data — so
`mutate` MUST be a pure function. Do not close over state from before
the call. Up to 3 attempts with exponential backoff (200ms / 400ms / 800ms).

## Errors

All client errors subclass `GitHubError`:

- `GitHubAuthError` (401) — PAT expired or wrong scope.
- `GitHubConflictError` (409/422) — SHA precondition failed. `update()`
  retries internally; if you use `write()` directly, it's your job.
- `GitHubNotFoundError` (404) — file or repo missing.

## Mutations

All four are pure functions of `BookmarksFile → BookmarksFile`. They take
`nowIso` explicitly so the caller controls timestamps (and so tests are
deterministic).

- `addBookmark(file, bookmark, nowIso)`
- `updateBookmark(file, id, patch, nowIso)`
- `softDeleteBookmark(file, id, nowIso)` — sets `deleted_at`
- `gcTombstones(file, olderThanDays, nowIso)` — drops bookmarks whose
  `deleted_at` is older than the threshold. Git history retains them.

## URL normalization

```ts
import { normalizeUrl } from "@gitmarks/core";
normalizeUrl("https://example.com/path/#section");
// → "https://example.com/path"
```

Strips trailing slashes from the path; drops fragments unless they start
with `#!` (hashbang routes are preserved).
