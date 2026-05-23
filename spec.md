# Bookmark Sync — Spec

**Author:** Sid (paperhurts)
**Date:** 2026-05-23
**Status:** Draft — pre-execution
**Codename:** TBD (working: `gitmarks`)

---

## What this is, in one paragraph

A serverless cross-browser bookmark sync system. Two clients — a browser extension and a web UI — that both talk directly to GitHub. Each user's bookmarks live as a JSON file in a private GitHub repo of their own. There is no server, no backend, no infrastructure to host. The extension keeps each browser's native bookmark tree in sync with the JSON file. The web UI provides search, tagging, and bulk organization. Open source. Self-hosted in the only sense that matters: you own the repo your data lives in.

## Goal

- Bookmarks sync natively across Chrome, Firefox, Brave, and eventually Safari.
- Bookmarks appear in each browser's real bookmark bar, not a separate UI.
- A web UI for search, tagging, and bulk organization.
- Single source of truth: a JSON file in the user's own GitHub repo.
- Zero infrastructure. No server to host, no machine to maintain.
- Shippable as open source. Folks can clone, configure, and use it without any help.

## Non-goals

- Multi-user / shared collections. Every user has their own repo. 
- Importing browser history. Bookmarks only.
- Bookmark thumbnails or rich previews. Favicons fetched live.
- Real-time sub-second sync. Eventual consistency within ~30s is fine.
- Public bookmark sharing.

## Architecture

```
[Chrome ext] [Firefox ext] [Brave ext] [Safari ext]    [Web UI on GitHub Pages]
       \         |             /            /                /
        \        |            /            /                /
         v       v           v            v                v
                       GitHub REST API
                              |
                              v
                    Private repo (user's own)
                    bookmarks.json + tags.json
```

- **No server.** Both clients talk directly to GitHub's REST API.
- **Auth:** GitHub fine-grained personal access token (PAT), scoped to one repo, with `contents:write` permission. User generates this themselves and pastes it into extension/web settings.
- **Storage:** A private GitHub repo the user creates (or the extension creates on first run, if granted permission). `bookmarks.json` and `tags.json` at repo root. Full commit history is the audit log.
- **Sync model:** Event-driven for local changes (extension listens to `chrome.bookmarks.*` events). Periodic poll for remote changes (every 5 minutes via `chrome.alarms`; manual "sync now" available).
- **Conflict handling:** Optimistic concurrency via GitHub's file SHA. Loser retries with the latest SHA. Soft deletes (tombstones) eliminate most conflicts.

## Data model

### `bookmarks.json`

```json
{
  "version": 1,
  "updated_at": "2026-05-23T14:32:11Z",
  "bookmarks": [
    {
      "id": "01HXYZ8K7M9P3RQ2V5W6Z8B0C1",
      "url": "https://example.com/article",
      "title": "Article title",
      "folder": "Research/AI",
      "tags": ["claudepi", "to-read"],
      "added_at": "2026-05-23T14:32:11Z",
      "updated_at": "2026-05-23T14:32:11Z",
      "added_from": "chrome@minerva",
      "deleted_at": null,
      "notes": null
    }
  ]
}
```

**Field rules:**

- `id` — ULID. Generated client-side. Sortable by creation time.
- `url` — normalized: trailing slashes stripped, fragments dropped unless `#!` (hashbang routes).
- `folder` — string path with `/` separator. `""` means root. Folder structure is derived, not stored separately.
- `tags` — lowercase strings. Web UI only; not reflected in native browser tree.
- `added_from` — `<browser>@<machine>` for debugging.
- `updated_at` — set on every PATCH. Used for last-write-wins conflict resolution.
- `deleted_at` — soft delete tombstone. GC'd from the JSON after 30 days. Git history retains everything forever.

### `tags.json`

```json
{
  "version": 1,
  "tags": {
    "claudepi": { "color": "#FF00FF", "description": "ClaudePi research" },
    "to-read": { "color": "#00FFFF", "description": null }
  }
}
```

Separate file so renaming a tag doesn't churn every bookmark.

## How clients talk to GitHub

All operations use the GitHub Contents API:

- **Read:** `GET /repos/{owner}/{repo}/contents/bookmarks.json` returns `{ content: <base64>, sha: <string> }`.
- **Write:** `PUT /repos/{owner}/{repo}/contents/bookmarks.json` with body `{ message, content: <base64>, sha: <prev_sha> }`. If the file changed since `prev_sha`, GitHub returns 409. Client refetches and retries.

### Write sequence (single change)

1. Listener fires: `chrome.bookmarks.onCreated` (or web UI button click).
2. Debounce 500ms — coalesce burst events.
3. GET `bookmarks.json` and `tags.json` (current SHA, current content).
4. Mutate in memory.
5. PUT updated `bookmarks.json` with `prev_sha`.
6. On 200: update local cache, done.
7. On 409: GET again, replay the mutation against fresh content, PUT again. Exponential backoff up to 3 retries.
8. On 3 failed retries: queue the change locally, surface a yellow status indicator, retry on next sync tick.

### Read sequence (periodic poll)

1. Every 5 minutes via `chrome.alarms`, GET `bookmarks.json`.
2. Compare SHA against last-known SHA in extension storage.
3. If unchanged: do nothing.
4. If changed: diff against local browser bookmark tree, apply adds/deletes/moves to `chrome.bookmarks`.

This is the "GitHub doesn't push, we poll" loop. 5-minute interval is the industry default for MV3 service workers. Costs ~288 GET requests/day per extension, well under GitHub's 5000/hour rate limit.

### Manual "sync now"

User clicks toolbar icon → immediate GET + diff cycle. Useful when they know a bookmark was added on another device and don't want to wait.

## Rate limiting & GitHub quotas

- **Authenticated REST API limit:** 5000 requests/hour per PAT.
- **Worst-case usage:** 4 browsers polling every 5 min = 48 req/hr. Plus user-initiated writes, maybe 50/day. Total well under 1% of quota.
- **Conditional requests:** Use `If-None-Match: <etag>` on polls. Unchanged responses are 304 and don't count against the rate limit. Effectively free polling.

## Conflict scenarios

| Scenario | What happens |
|---|---|
| Two browsers add bookmarks simultaneously | Both PUT, second one gets 409, refetches, includes both adds in retry. Both bookmarks land. |
| Add same URL from two browsers at once | Both create entries with different IDs. Next sync, web UI shows duplicates. Dedupe logic in the extension reconciler removes the older `added_at` on next read. Acceptable. |
| Delete on browser A, edit on browser B, A wins the race | A's tombstone has newer `updated_at`. B's edit later loses on read because tombstone overrides. B's edit is lost but git history retains. |
| User loses network mid-write | Change queued locally in `chrome.storage.local`. Yellow status indicator. Retry on next event or every 5 min. |
| User's PAT expires | All API calls return 401. Extension surfaces red status + "please re-authenticate." No data loss; local cache stays intact. |

## Extension behavior

### First-run setup

1. User installs extension.
2. Toolbar icon opens setup page: "Paste your GitHub PAT" + "Enter repo (owner/name)."
3. Extension validates PAT against the repo (GET `/repos/{owner}/{repo}`).
4. If repo doesn't exist: offer to create it. Requires `repo:create` scope on PAT.
5. If repo is empty: extension creates `bookmarks.json` and `tags.json` with empty schemas.
6. If repo has existing data: extension imports it into the native browser tree (initial reconciliation, see below).
7. PAT stored in `chrome.storage.local`.

### Initial reconciliation (after setup, or after extension reinstall)

```
remote = GET bookmarks.json
local = chrome.bookmarks.getTree()

# Build URL → bookmark maps
remote_urls = { b.url: b for b in remote.bookmarks if not b.deleted_at }
local_urls = { node.url: node for node in flatten(local) if node.url }

# Pull: remote bookmarks not in local browser → create
for url, r in remote_urls.items():
    if url not in local_urls:
        chrome.bookmarks.create({
            parentId: ensure_folder_chain(r.folder),
            title: r.title,
            url: r.url
        })

# Push: local browser bookmarks not in remote → POST
new_bookmarks = []
for url, node in local_urls.items():
    if url not in remote_urls:
        new_bookmarks.append({
            id: ulid(),
            url, title: node.title,
            folder: derive_folder(node),
            added_at: node.dateAdded or now(),
            updated_at: now(),
            added_from: f"{browser}@{machine_name}",
            tags: [], deleted_at: null, notes: null
        })

if new_bookmarks:
    write bookmarks.json with new_bookmarks appended

# Save id ↔ chrome_node_id map in chrome.storage.local
```

### Steady-state listeners

- `chrome.bookmarks.onCreated` → debounce 500ms → push new bookmark.
- `chrome.bookmarks.onRemoved` → push soft delete (`deleted_at`).
- `chrome.bookmarks.onChanged` → push title/URL update.
- `chrome.bookmarks.onMoved` → recompute folder path, push folder update.

### ID mapping

Native browser node IDs aren't stable across reinstalls. Extension stores `{ ulid: chrome_node_id }` and inverse in `chrome.storage.local`. Rebuilt on first sync after install via URL match.

### Native folder ↔ folder string

- `Bookmarks Bar` (chrome.bookmarks.getTree()[0].children[0]) ↔ `folder: ""` (root).
- `Other Bookmarks` ↔ `folder: "_other"`.
- Nested folders concatenated with `/`.

## Web UI

- Static SPA. Cloudflare Pages or GitHub Pages.
- React + Vite + Tailwind. Aesthetic (cyan/magenta on dark).
- Auth: same PAT model as extension. User pastes once, stored in `localStorage`.
- Talks to GitHub Contents API directly. Same conflict logic as extension.
- Features:
  - List + search (client-side, all data in memory).
  - Tag management.
  - Bulk operations (multi-select, tag/move/delete).
  - Trash view (soft-deleted bookmarks, restore before GC).
  - Manual "sync from GitHub" + "force refresh."
  - Export to Netscape HTML format (emergency portability).
- No bookmark creation in web UI v1. Adding happens via browser extension on the actual page.

## Build order

1. **Schema + validator + example repo** (half day). JSON schema for `bookmarks.json` and `tags.json`. A Node/Python validator script. An example repo with 10 hand-written bookmarks to test against.
2. **GitHub API client library** (1 day). Shared TypeScript module: `read()`, `write(content, sha)`, conflict retry, ETag-based conditional fetches. Used by both extension and web UI.
3. **Chrome extension MVP** (1 day). MV3 service worker. Toolbar button "save current page." Setup flow for PAT + repo. No native tree integration yet.
4. **Chrome native tree integration** (2 days). Listeners + initial reconciliation + ID mapping + 5-min poll loop. The hard piece.
5. **Firefox build** (half day). `webextension-polyfill`. Separate manifest. Mostly same code.
6. **Brave** (1 hour). Chrome bundle works as-is. Test, ship.
7. **Web UI MVP** (1-2 days). List, search, tag editor.
8. **Web UI write ops** (1 day). Bulk operations, trash view, export.
9. **Documentation** (1 day). README, setup guide, screenshots. This is what makes it open source vs "Sid's personal tool on GitHub."
10. **Safari** (1-2 days). `safari-web-extension-converter` on Chrome bundle. Sign with personal Apple Developer account ($99/yr) or weekly free rebuild.

Total: ~9-11 days of focused work.

## Repo layout

```
gitmarks/
├── README.md                       # what it is, why, how to set up
├── SPEC.md                         # this file
├── packages/
│   ├── core/                       # shared TS: GitHub client, schema, types, conflict logic
│   ├── extension-chrome/           # MV3 manifest, build config
│   ├── extension-firefox/          # MV2/MV3 manifest
│   ├── extension-safari/           # Xcode project (added late)
│   ├── extension-shared/           # background.ts, oauth.ts, reconcile.ts, listeners.ts
│   └── web/                        # Vite + React SPA
├── docs/
│   ├── SETUP.md                    # how to make a repo + PAT
│   ├── SCHEMA.md                   # data model reference
│   └── CONTRIBUTING.md
├── examples/
│   └── example-bookmarks-repo/     # sample data repo for testing
└── package.json                    # monorepo with pnpm workspaces
```

## Security considerations

- **PAT scope.** Document that users should create a fine-grained PAT scoped to *only* the bookmarks repo with *only* `contents:read/write` permission. Never a classic PAT with full repo access. Setup guide makes this explicit with screenshots.
- **PAT storage.** `chrome.storage.local` (extension) and `localStorage` (web UI). Both are origin-scoped. Document the exposure: anyone with access to your browser profile can read it. Acceptable for a personal tool, callout in README.
- **Repo privacy.** Document that the repo should be private. Public repo + the project name = anyone can find your bookmarks. Setup script should default to creating private.
- **No telemetry.** Project never phones home. Document this prominently.

## Open questions

- **PAT rotation reminders.** Should the extension surface a "your PAT expires in N days" warning? GitHub fine-grained PATs have configurable expirations up to 1 year. Probably yes — soft warning at 30 days, hard at 7.
- **Bookmark URL normalization edge cases.** Query string handling: `?utm_source=...` parameters. Strip tracking params on save? Configurable list? Default off, add a "clean URL" toggle in settings.
- **Folder rename cost.** Moving a top-level folder ("Research" → "Archive/Research") generates N PATCHes if N bookmarks live under it. Acceptable for hundreds of bookmarks. For thousands, may want a batched "rename folder" operation. Punt to v1.5.
- **Tag hierarchy.** Flat tags v1. Hierarchical tags (`ai/agents/multi-agent`) are a v2 conversation.
- **Conflict on `tags.json`.** Tag color edits race the same way bookmark edits do. Same conflict retry logic applies, lower volume so probably never a problem in practice.

## What I'm explicitly NOT building

- Browser extension store distribution. Ship as developer-mode unpacked extensions on Chrome/Brave/Firefox; signed self-distributed on Safari. If usage justifies it later, do Web Store review then.
- A "first-class" UI for resolving conflicts. LWW with tombstones is enough for the volumes involved.
- Encryption at rest beyond GitHub's. The repo is private and HTTPS-only. Adding client-side encryption would defeat the "git history is human-readable" feature.
- Bookmark deduplication beyond exact URL match. Different `utm_source` params = different bookmarks unless URL normalization is on. Acceptable.

