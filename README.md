# gitmarks

Serverless cross-browser bookmark sync. Bookmarks live as a JSON file in
**your own private GitHub repo**; browser extensions and a web UI both talk
directly to the GitHub Contents API. No server, no backend, no
infrastructure to host. You own your data — it's just a file in a repo
you control.

**Status:** Chrome extension is functional end-to-end (save via toolbar
button, save all open tabs in one action, two-way sync with the native
bookmark tree, 5-min poll for remote changes, automatic conflict retry).
Firefox MV3 add-on shipping the same
source as Chrome via a shared package. Web UI (list, search, tag management,
bulk operations, trash, Netscape HTML export, sign out) deploys as a static
SPA. Safari is next in the roadmap. See `spec.md` for the full design.

## Features (Chrome, today)

- Save the current tab to GitHub via a toolbar button
- **Save all open tabs** in the current window in one action — batched into a
  single `bookmarks.json` write, grouped under a dated `Session YYYY-MM-DD`
  folder, with exact-URL de-dupe and browser-internal tabs skipped
- Open the companion **web UI** directly from the popup
- Drag a URL to your Chrome bookmarks bar → it appears in `bookmarks.json`
  on GitHub within ~1 second
- Edit a bookmark's title in Chrome → updates remote within ~1 second
- Delete a bookmark in Chrome → soft-deleted (tombstoned) remotely;
  garbage-collected from the JSON after 30 days but retained in git
  history forever
- Edit `bookmarks.json` directly on GitHub → changes pull into Chrome
  on the next 5-minute poll
- Concurrent edits from multiple devices reconcile automatically via
  GitHub's file SHA + optimistic retry-replay
- 306 automated unit + component tests + 6 Playwright e2e (against real Chromium)
- Optional **tracking-param stripping** (utm_*, fbclid, gclid, etc.) at save time — opt-in via settings
- Dark cyan/magenta themed popup + options pages, matching the web UI

## Packages

| Package | Role |
|---|---|
| `@gitmarks/core` | Shared TypeScript library: schemas (Zod), GitHub Contents API client with optimistic concurrency, ULID + URL helpers, pure mutation helpers |
| `@gitmarks/extension-shared` | Cross-browser extension source — popup, options, background, lib/ helpers. Consumed by both browser shells via `workspace:*`. 115 unit tests live here. |
| `@gitmarks/extension-chrome` | Chrome MV3 shell. Manifest + Vite/crxjs build + Playwright e2e. Thin entry files import from `extension-shared`. |
| `@gitmarks/extension-firefox` | Firefox MV3 shell. Manifest + plain Vite build. Same source as Chrome via `extension-shared`. Load via `about:debugging`. |
| `@gitmarks/web` | Static SPA — list, search, tag management, bulk operations, trash, Netscape HTML export, sign out. Vite + React + Tailwind. Talks directly to GitHub via `@gitmarks/core`. Deploys to GitHub Pages or Cloudflare Pages. |

## Try the web UI

The read-side web UI is auto-deployed to GitHub Pages:
**https://paperhurts.github.io/gitmarks/**

You'll need a fine-grained PAT (see "Your data, your PAT" below) and your
own private bookmarks repo. The web UI runs entirely in your browser — no
server sees your token.

## Quick start (Chrome extension)

```bash
pnpm install
pnpm --filter @gitmarks/extension-chrome build
```

Then in Chrome:
1. `chrome://extensions/` → toggle **Developer mode** on
2. **Load unpacked** → select `packages/extension-chrome/dist/`
3. Click the toolbar icon → "Set up gitmarks"
4. Paste a fine-grained PAT (Contents: read/write scope on your bookmarks
   repo), enter owner/repo/branch, click **Save**

See `packages/extension-chrome/README.md` for the full setup walkthrough,
the manual smoke test checklist, and architecture notes.

## Your data, your PAT

- **The repo must be private.** Public repo + the project name = anyone
  can find your bookmarks. The extension does NOT enforce this — it's
  on you when you create the repo on github.com.
- **Use a fine-grained PAT** scoped to *only* your bookmarks repo with
  *only* Contents: read/write. Never use a classic PAT or one with broader
  scopes — if your browser profile is ever exfiltrated, that token only
  unlocks your bookmarks, not your whole GitHub account.
- **The PAT is stored in `chrome.storage.local`**, which is origin-scoped
  (other extensions / sites can't read it) but readable by anyone with
  access to your unlocked browser profile. Treat it like a saved
  password.
- **No telemetry.** The extension only talks to `api.github.com`. That's
  enforced by the MV3 manifest's `host_permissions`.

### PAT lifecycle / revocation

When you stop using gitmarks (uninstall the extension, clear browser data, or switch machines):

1. **Revoke the PAT on github.com.** Settings → Developer settings → Personal access tokens → Fine-grained tokens → find the one named for your bookmarks repo → **Delete**. This is the only authoritative way to invalidate the credential.
2. **Web UI:** click **Sign out** in the header. This clears `localStorage` on your current machine. (It does NOT revoke the token on GitHub — see step 1.)
3. **Extension:** uninstalling the extension removes its `chrome.storage.local` entry on that machine. The token on GitHub remains valid until you revoke it.

Treat the PAT like a saved password. If a machine is lost or compromised, revoke immediately on github.com.

## Development

```bash
# Everything
pnpm install
pnpm test           # all unit tests across packages
pnpm typecheck
pnpm build

# Just one package
pnpm --filter @gitmarks/core test
pnpm --filter @gitmarks/extension-shared test   # all extension unit tests live here
pnpm --filter @gitmarks/extension-chrome e2e    # Playwright + real Chromium
```

The repo is a pnpm workspace monorepo. Each package has its own
`README.md` with package-specific docs.

## Architecture

```
[Chrome ext] [Firefox ext] [Safari ext (planned)]    [Web UI]
       \             |                       /                       /
        \            |                      /                       /
         v           v                     v                       v
                          GitHub REST API (api.github.com)
                                       |
                                       v
                          User's private repo: bookmarks.json + tags.json
```

The load-bearing invariants:

- **No server, ever.** Clients talk to GitHub REST API directly. PAT
  lives client-side (`chrome.storage.local`).
- **Optimistic concurrency** via GitHub file SHA. On 409, the core
  client refetches and replays the mutation (up to 3 attempts with
  exponential backoff).
- **Eventual consistency, ~30s target.** Event-driven push for local
  changes (500ms debounce). 5-minute poll for remote changes via
  `chrome.alarms`, with ETag conditional reads so unchanged polls cost
  nothing against the rate limit.
- **Soft deletes** (tombstones) for ~30 days; git history retains
  everything forever.
- **Suppression registry** prevents loop-back: when the extension applies
  a remote change to `chrome.bookmarks`, the affected URL is parked in
  an in-memory registry for ~2 seconds so the resulting local event
  doesn't echo back to GitHub.

## Roadmap

- ✅ `@gitmarks/core` — schemas, GitHub client, mutations
- ✅ Chrome MVP — toolbar-button save flow
- ✅ Chrome native tree integration — listeners, reconcile, poll loop
- ✅ Tracking-param stripping (opt-in)
- ✅ Firefox MV3 add-on ([#23](https://github.com/paperhurts/gitmarks/issues/23))
- ✅ Web UI v1: list + search + tag management ([#24](https://github.com/paperhurts/gitmarks/issues/24))
- ✅ Web UI v2: bulk operations + trash + export ([#25](https://github.com/paperhurts/gitmarks/issues/25))
- ✅ Bookmark all open tabs in one action ([#46](https://github.com/paperhurts/gitmarks/issues/46))
- ✅ Popup polish: web-UI theme, auto-dismiss after save, "Open web UI" link
- ⬜ Safari ([#26](https://github.com/paperhurts/gitmarks/issues/26))

## Files in this repo

- `spec.md` — full design spec (source of truth for non-obvious decisions)
- `CONTRIBUTING.md` — branch/PR conventions, TDD policy, plan-driven workflow
- `CLAUDE.md` — guidance for AI agents working in this repo
- `LICENSE` — MIT
- `docs/superpowers/plans/` — implementation plans, one per branch
- `packages/*/README.md` — package-specific documentation
- `examples/example-bookmarks-repo/` — sample `bookmarks.json` + `tags.json`
  to seed a fresh repo, used by `@gitmarks/core` fixture tests
- `.github/workflows/test.yml` — CI (typecheck + unit tests + build on every PR)

## Contributing

See `CONTRIBUTING.md` for the branch/PR conventions, conventional-commit
scopes, and the plan-driven workflow used for larger features. Every
change goes through a PR with green CI — no direct commits to `main`.
