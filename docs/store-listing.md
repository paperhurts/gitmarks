# Store listing copy

Ready-to-paste text for the Chrome Web Store and Firefox AMO submissions.
Positioning: developers + the privacy / own-your-data crowd.

---

## Name
`gitmarks`

## Category
- Chrome Web Store: Productivity (subcategory Tools)
- Firefox AMO: Bookmarks + Privacy & Security (AMO has no Productivity category)

## Summary (Chrome: ≤132 chars)
> Sync bookmarks to your own private GitHub repo. No server, no account, no tracking — your data is a file you control.

(118 chars.)

## Short description (Firefox AMO summary, ≤250 chars)
> Bookmarks that live in your own GitHub repo. Two-way sync with your browser's bookmark bar, cross-browser and cross-device, with full git history. No server, no account, no tracking. You own your data — it's just a file in a repo you control.

---

## Detailed description

**Your bookmarks, in your own Git repo.**

gitmarks syncs your browser bookmarks to a private GitHub repository that you
own — as a plain, human-readable JSON file. There's no gitmarks server, no
account to create, and no tracking. Your data never touches anyone's backend but
GitHub's, authenticated with your own token.

**Why you'll like it**

• **You own your data.** Bookmarks are a `bookmarks.json` file in your private
repo. Export it, read it, diff it, delete it — no lock-in.
• **A time machine for your bookmarks.** Every change is a git commit, so your
full history is preserved forever. Restore anything.
• **Two-way sync with your native bookmarks.** Add, edit, or remove a bookmark
in your browser and it syncs to your repo within seconds; changes on GitHub pull
back into your browser.
• **Save the current tab — or all open tabs** — in one click, grouped into a
dated folder.
• **Cross-browser & cross-device.** Chrome and Firefox share the same repo.
• **A companion web app** to search, tag, organize, and export your bookmarks.
• **Private by design.** No server, no analytics, no third parties. The
extension talks only to api.github.com.
• **Open source.** Read every line: https://github.com/paperhurts/gitmarks

**What you need**

A GitHub account, a private repository for your bookmarks, and a fine-grained
personal access token scoped to only that repo (Contents: read/write). Setup
takes a couple of minutes — the extension walks you through it.

**Note:** gitmarks is built for people comfortable with GitHub. If you want
one-click cloud sync with no setup, your browser's built-in sync is simpler;
gitmarks is for people who want to *own* their bookmarks.

---

## Permission justifications (for the store review form)

- **storage** — Stores your settings and a local bookmark-id map on your device.
- **bookmarks** — Reads and writes your browser's bookmark tree to sync it with
  your GitHub repo.
- **alarms** — Schedules a periodic (5-minute) check for changes made on GitHub
  or another device.
- **activeTab** — Reads the current tab's URL and title when you click
  "Save this page".
- **tabs** (optional, on-demand) — Requested only when you click "Save all tabs",
  to read the URLs/titles of open tabs in the current window. Not requested at
  install.
- **Host permission `https://api.github.com/*`** — Reads and writes your bookmark
  files in your GitHub repository. This is the only host gitmarks contacts.

## Data use disclosures (Chrome "Privacy practices" tab)

- Personally identifiable / authentication info? **Stored locally only** (your
  GitHub token). Not collected by the developer, not transmitted to us.
- Does this item collect or use user data? It reads bookmarks/tabs and writes
  them **to the user's own GitHub repository**; the developer receives nothing.
- Sold to third parties? **No.**
- Used for purposes unrelated to core functionality? **No.**
- Used for creditworthiness / lending? **No.**
- We certify compliance with the Developer Program Policies.

Privacy policy URL: `https://paperhurts.github.io/gitmarks/privacy.html`
(served from the static `packages/web/public/privacy.html`, themed to match
paperhurts.dev; keep it in sync with `docs/privacy-policy.md`, the
repo-readable copy).

## Data-type disclosures (actual store answers, 2026-07)

- **CWS data-usage checkboxes**: `Web history` (bookmark/tab URLs + titles are
  transmitted to the user's own repo) and `Authentication information` (the PAT
  is stored locally and sent to api.github.com with each request). All three
  certifications checked (no sale/transfer, no unrelated use, no
  creditworthiness use). Remote code: **No** (MV3, fully bundled).
- **AMO manifest `data_collection_permissions`**: `required: ["bookmarksInfo"]`
  (see #73/#75 — Mozilla counts "transferred outside the local browser" as
  collection even when the destination is the user's own repo).

---

## Assets checklist
- Icon 128×128 — ✅ generated (`assets/gitmarks.svg` → PNGs).
- Screenshots 1280×800 — ✅ options page + popup (generated; add 1–3 more
  showing the web app / save flow if desired).
- Small promo tile 440×280 — ⬜ optional but recommended (a branded card with
  the wordmark + tagline "Bookmarks that live in your Git repo").

## Hosting the privacy policy
✅ Done — live at `https://paperhurts.github.io/gitmarks/privacy.html`,
served from the static `packages/web/public/privacy.html` (Vite copies
`public/` into `dist/`; themed to match paperhurts.dev, commit 109f583).
`docs/privacy-policy.md` remains the repo-readable copy — update both
together.

---

## Releases

### Release checklist (any version)
1. Bump `version` in `packages/extension-chrome/manifest.config.ts` **and**
   `packages/extension-firefox/manifest.json` (keep them equal).
2. From a clean checkout of the release commit, build both:
   `pnpm install --frozen-lockfile && pnpm build`.
3. Zip the *contents* of `packages/extension-chrome/dist/` →
   `store-submission/gitmarks-chrome-X.Y.Z.zip` (CWS upload).
4. Zip the *contents* of `packages/extension-firefox/dist/` →
   `store-submission/gitmarks-firefox-X.Y.Z.zip` (AMO upload).
5. `git archive --format=zip -o store-submission/gitmarks-source-X.Y.Z.zip HEAD`
   (AMO asks for source because the add-on is bundled by Vite).
6. AMO: paste the release notes and the reviewer build notes below.
7. Tag the release commit `vX.Y.Z` after both stores accept it.

### AMO reviewer build notes (paste into "Notes to reviewer")
> The add-on is built from this monorepo with Vite. To reproduce
> `gitmarks-firefox-X.Y.Z.zip` from the attached source zip:
>
> - Node.js 20 or newer (built with Node 24.11.1), pnpm 9 (built with 9.15.9)
> - `pnpm install --frozen-lockfile`
> - `pnpm --filter @gitmarks/core build`
> - `pnpm --filter @gitmarks/web build`
> - `pnpm --filter @gitmarks/extension-firefox build`
>
> Output: `packages/extension-firefox/dist/`. `web/` inside it is the
> project's own web UI (`packages/web`), bundled so it can read the add-on's
> settings; it is an extension page under the manifest CSP and talks only to
> api.github.com. No remote code, no minified third-party code beyond npm
> dependencies listed in `pnpm-lock.yaml`.
>
> `web-ext lint` reports two `UNSAFE_VAR_ASSIGNMENT` warnings in
> `web/assets/index-*.js`. Both are inside React DOM itself (its
> `dangerouslySetInnerHTML` / SVG setter); gitmarks never uses
> `dangerouslySetInnerHTML`, and the web UI renders bookmark data only as
> React text nodes.

### 1.1.0 release notes
> **Tags, a built-in web UI, and important sync fixes.**
>
> - **Tag before saving:** add tags right in the popup, with suggestions from
>   tags you already use. Reopen the popup on a saved page to edit its tags.
> - **No second setup:** "Open web UI" now opens a copy built into the
>   extension that uses the extension's settings — no re-entering your token.
> - **Fixed: duplicate bookmarks.** Bookmarks whose URL ended in a slash or
>   had a #section could be uploaded again on each sync. If your repo grew
>   duplicates, open the web UI → **Remove duplicates**, then Trash →
>   **Empty trash**.
> - **Fixed: large bookmark files.** Repos with a `bookmarks.json` over 1 MB
>   now sync instead of failing.
> - Trash is now actually cleared after 30 days; clearer GitHub error messages.

Plain-text version for the CWS (no release-notes field; use it in the
"What's new" part of the description if wanted):
Tags in the popup · built-in web UI with no second setup · fixes duplicate
bookmarks and repos over 1 MB · trash cleared after 30 days.
