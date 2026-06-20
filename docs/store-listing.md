# Store listing copy

Ready-to-paste text for the Chrome Web Store and Firefox AMO submissions.
Positioning: developers + the privacy / own-your-data crowd.

---

## Name
`gitmarks`

## Category
Productivity

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

Privacy policy URL: `https://paperhurts.github.io/gitmarks/privacy-policy.html`
(host `docs/privacy-policy.md` on GitHub Pages — see below).

---

## Assets checklist
- Icon 128×128 — ✅ generated (`assets/gitmarks.svg` → PNGs).
- Screenshots 1280×800 — ✅ options page + popup (generated; add 1–3 more
  showing the web app / save flow if desired).
- Small promo tile 440×280 — ⬜ optional but recommended (a branded card with
  the wordmark + tagline "Bookmarks that live in your Git repo").

## Hosting the privacy policy
`docs/privacy-policy.md` needs to be reachable at a public URL. Options:
1. Render it into the existing GitHub Pages site as `privacy-policy.html`, or
2. Link to the rendered Markdown on GitHub:
   `https://github.com/paperhurts/gitmarks/blob/main/docs/privacy-policy.md`
   (acceptable to both stores, but a Pages URL looks more official).
