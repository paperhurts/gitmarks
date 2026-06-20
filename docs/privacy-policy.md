# gitmarks — Privacy Policy

_Last updated: 2026-06-19_

gitmarks is a serverless browser extension and web app for syncing your
bookmarks to **your own private GitHub repository**. This policy explains what
data it handles and where that data goes.

## The short version

- **There is no gitmarks server.** The developer operates no backend, database,
  or analytics. We never receive your data.
- Your bookmarks live in **a GitHub repository you own and control**.
- Your GitHub token and settings are stored **locally on your device**.
- The extension talks to **only one network host: `https://api.github.com`**.

## What data gitmarks handles, and where it goes

| Data | Where it's stored | Who can see it |
|---|---|---|
| Your bookmarks (`bookmarks.json`, `tags.json`) | Your private GitHub repo | You (and GitHub, as your repo host) |
| Your GitHub personal access token (PAT) | Locally — `chrome.storage.local` (extension) / `localStorage` (web app) | Anyone with access to your unlocked browser profile |
| Settings (repo owner/name/branch, options) | Locally, same as above | Same as above |
| Bookmark/tab URLs and titles | Read from your browser, written to your repo | You |

gitmarks does **not** collect, transmit to the developer, sell, or share any of
this data. It is never sent anywhere except the GitHub API, on your behalf,
authenticated with your own token.

## Permissions and why they're needed

- **`storage`** — save your settings and a local id map on your device.
- **`bookmarks`** — read and write your browser's native bookmark tree to keep
  it in sync with your repo.
- **`alarms`** — schedule a periodic (5-minute) check for remote changes.
- **`activeTab`** — read the current tab's URL and title when you click
  "Save this page".
- **`tabs`** (optional, requested only when you click "Save all tabs") — read
  the URLs and titles of the open tabs in the current window so they can be
  saved together. Not requested at install time.
- **Host access to `api.github.com`** — read and write your bookmark files in
  your repo.

## Third parties

The only third party involved is **GitHub**, because your bookmarks are stored
in your GitHub repository and all requests go to the GitHub API. Your use of
GitHub is governed by [GitHub's Privacy Statement](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement).
gitmarks uses no analytics, advertising, tracking, or other third-party
services.

## Your control

- **Revoke access at any time** by deleting the fine-grained token in
  GitHub → Settings → Developer settings → Personal access tokens.
- **Remove local data** by clicking "Sign out" in the web app, or uninstalling
  the extension (which clears its local storage on that device). Uninstalling
  does **not** revoke the token on GitHub — delete it there as above.
- **Delete your data** by deleting the bookmark files or the repository on
  GitHub.

## Children

gitmarks is a developer tool and is not directed to children under 13.

## Changes

Material changes to this policy will be reflected in this file in the public
repository, with an updated date above.

## Contact

Questions or concerns: open an issue at
<https://github.com/paperhurts/gitmarks/issues>.
