# @gitmarks/extension-safari

Safari web extension. Save bookmarks to your own GitHub repo from the
toolbar popup. Loads the same popup/options code as the Chrome and
Firefox extensions via `@gitmarks/extension-shared`.

## ⚠️ Safari is a save-only client

Safari does **not** implement the `browser.bookmarks` WebExtension API
(long-standing gap — Apple developer forums threads
[650614](https://developer.apple.com/forums/thread/650614),
[658034](https://developer.apple.com/forums/thread/658034),
[721635](https://developer.apple.com/forums/thread/721635); see also the
[MDN compat table](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/bookmarks)).

Everything the background layer does in the other shells — bookmark
listeners, cold-start reconcile, applying remote changes to the native
tree, the 5-minute poll alarm — exists to sync the native bookmark tree,
so none of it can work in Safari. This shell therefore ships **no
background at all** and no `bookmarks`/`alarms` permissions. What works:

- **Save this page** — popup-direct save to GitHub (same code path as
  Chrome/Firefox; the popup never depended on the background).
- **Save all tabs** — batched save into a `Session YYYY-MM-DD` folder
  (`tabs` permission requested on demand).
- **Options** — PAT/repo/branch setup, validation, strip-tracking-params.
- **Everything else via the web UI** — search, tags, bulk ops, trash,
  export at https://paperhurts.github.io/gitmarks/ (the popup footer
  links to it).

What does NOT work on Safari: bookmarks saved from other browsers do not
appear in Safari's native bookmarks, and bookmarking inside Safari's own
UI (⌘D) does not sync. Save through the gitmarks toolbar popup instead.

If Apple ever ships the bookmarks API, the full background layer can be
turned on by adding the `background` entry + `bookmarks`/`alarms`
permissions back — the shared code already supports it.

## Build (any OS)

```bash
pnpm --filter @gitmarks/extension-safari build
```

Produces a converter-ready web extension in
`packages/extension-safari/dist/` (manifest, popup, options, icons).

## Convert + run (macOS only)

Apple's converter and Xcode only run on macOS. On a Mac with Xcode
installed:

```bash
xcrun safari-web-extension-converter packages/extension-safari/dist \
  --project-location packages/extension-safari/xcode \
  --app-name gitmarks \
  --bundle-identifier dev.paperhurts.gitmarks \
  --macos-only \
  --no-open --no-prompt
```

The generated Xcode project lands in `packages/extension-safari/xcode/`
(git-ignored — it's derived output, regenerate after every `dist/`
change or copy the new `dist/` into the project's `Resources`).

Then:

1. Open the project: `open packages/extension-safari/xcode/gitmarks/gitmarks.xcodeproj`
2. Build & run the macOS app target (⌘R). The wrapper app registers the
   extension with Safari; the app window itself can be closed.
3. Safari → Settings → **Developers** tab → enable **Allow unsigned
   extensions** (re-required each Safari relaunch unless signed).
   On older Safari: Develop menu → Allow Unsigned Extensions.
4. Safari → Settings → **Extensions** → enable **gitmarks**.
5. Grant access to `api.github.com` when Safari prompts on first save.

### Signing / distribution

- **Personal use, free:** run unsigned as above; re-enable "Allow
  unsigned extensions" after each Safari restart, rebuild from Xcode
  when the local signature expires.
- **Stable personal install:** sign with an Apple Developer account
  ($99/yr) using a Developer ID / development certificate in the Xcode
  target's Signing settings.
- Mac App Store listing and iOS Safari are out of scope (issue #26).

## First-run setup

Identical to Chrome — see `packages/extension-chrome/README.md`
"First-run setup". PAT + owner/repo/branch in the options page, Validate,
Save.

## Uninstall

Delete the wrapper app (and remove the extension in Safari Settings →
Extensions). **This does NOT revoke your GitHub PAT** — delete the token
at github.com → Settings → Developer settings → Personal access tokens.

## Manual smoke test (macOS)

The shared unit suite covers popup/options logic. Safari-specific wiring
needs a manual pass after converting:

**Load + popup:**

- [ ] Convert, build in Xcode, enable in Safari Settings → Extensions.
      The gitmarks toolbar icon appears.
- [ ] Click the icon before configuring → popup shows "Set up gitmarks".

**Setup flow:**

- [ ] "Set up gitmarks" → options page opens in a tab.
- [ ] Enter PAT + owner + repo + branch → Validate → Save. Both green
      outcomes (file exists / 404-but-repo-found) behave like Chrome.

**Save flow:**

- [ ] On any http(s) page, toolbar icon → **Save this page**. Cyan
      "✓ saved" within ~2s, popup auto-closes ~1.2s later. Entry appears
      in `bookmarks.json` on github.com.
- [ ] **Save all tabs:** several http(s) tabs open → **Save all tabs** →
      `✓ saved N tabs`, one batched commit under `Session YYYY-MM-DD`.
      First click prompts for the optional `tabs` permission.
- [ ] Popup footer **"Open web UI ↗"** opens the web UI in a new tab.

**Expected absences (not failures):**

- [ ] No native-tree import on setup, no ⌘D sync, no remote→Safari
      bookmark sync — see "save-only client" above.

## Architecture

`@gitmarks/extension-safari` is a thin shell over
`@gitmarks/extension-shared`, like the Chrome/Firefox shells but with no
background entry:

```
packages/extension-safari/
├── manifest.json             # MV3, no background, no bookmarks/alarms perms
├── vite.config.ts            # plain Vite, popup + options entries only
├── scripts/copy-html.mjs     # pulls popup.html/options.html from extension-shared
├── scripts/copy-manifest.mjs # copies manifest.json + icons/ into dist/
├── src/
│   ├── popup.ts              # → @gitmarks/extension-shared/popup
│   └── options.ts            # → @gitmarks/extension-shared/options
└── xcode/                    # (git-ignored) generated by safari-web-extension-converter
```
