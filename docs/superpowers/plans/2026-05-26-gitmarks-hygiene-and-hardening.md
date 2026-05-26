# Hygiene + Security Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close four open follow-up issues in one pass — HTML deduplication across extension shells (#33), `chrome.*` → `browser.*` type-position migration (#34), test assertion namespace cleanup (#35), and the remaining defense-in-depth security follow-ups from the web UI v2 audit (#39).

**Architecture:** Each issue is small and isolated; we land them as a single hardening branch with one commit per task. No new packages; no new dependencies. The work touches all three extension packages plus the web package.

**Tech Stack:** Same as the existing monorepo — TypeScript 5.4, Vite 5, Vitest 2, `webextension-polyfill@0.12.0`.

**Branch:** `feat/hygiene-and-hardening`

---

## File Structure

Files modified (no new packages):

```
packages/extension-chrome/
  package.json               # MODIFY: copy-html script + run before vite build
  scripts/copy-html.mjs      # NEW
  src/popup.html             # DELETE (now copied at build time)
  src/options.html           # DELETE
  .gitignore                 # MODIFY: ignore src/popup.html, src/options.html
  manifest.config.ts         # MODIFY: explicit content_security_policy.extension_pages
  package.json               # MODIFY: drop @types/chrome
  tsconfig.json              # MODIFY: drop chrome from types

packages/extension-firefox/
  package.json               # MODIFY: copy-html script
  scripts/copy-html.mjs      # NEW
  src/popup.html             # DELETE
  src/options.html           # DELETE
  .gitignore                 # MODIFY
  manifest.json              # MODIFY: explicit content_security_policy.extension_pages
  package.json               # MODIFY: drop @types/chrome
  tsconfig.json              # MODIFY: drop chrome from types

packages/extension-shared/
  src/lib/apply-remote.ts    # MODIFY: type ref + skip unsafe URLs from remote
  src/lib/listeners.ts       # MODIFY: type refs
  src/lib/reconcile.ts       # MODIFY: type ref
  test/setup.ts              # MODIFY: type refs + jsdoc note
  test/apply-remote.test.ts  # MODIFY: chrome.* → browser.*; add unsafe-URL skip test
  test/listeners.test.ts     # MODIFY: chrome.* → browser.*
  test/reconcile.test.ts     # MODIFY: chrome.* → browser.*
  package.json               # MODIFY: drop @types/chrome
  tsconfig.json              # MODIFY: drop chrome from types

packages/web/
  index.html                 # MODIFY: CSP meta tag
  src/components/Layout.tsx  # MODIFY: optional onSignOut + Sign out button
  src/routes/{ListPage,TagsPage,TrashPage}.tsx  # MODIFY: wire onSignOut
  test/components.Layout.test.tsx  # MODIFY: test onSignOut

README.md                    # MODIFY: PAT lifecycle section
packages/extension-chrome/README.md  # MODIFY: PAT revocation note in uninstall
packages/extension-firefox/README.md # MODIFY: PAT revocation note
CLAUDE.md                    # MODIFY: status updates, security posture summary
```

---

## Task 1: HTML deduplication (#33)

Single source of truth: `packages/extension-shared/src/{popup,options}.html`. Each shell gets a `copy-html.mjs` script that copies the shared HTML into its own `src/` before Vite builds. The copies are gitignored.

**Files:**
- Delete: `packages/extension-chrome/src/{popup,options}.html`
- Delete: `packages/extension-firefox/src/{popup,options}.html`
- Create: `packages/extension-chrome/scripts/copy-html.mjs`
- Create: `packages/extension-firefox/scripts/copy-html.mjs`
- Modify: `packages/extension-chrome/package.json` (prebuild hook + dev-time copy)
- Modify: `packages/extension-firefox/package.json`
- Modify: both `.gitignore` files

- [ ] **Step 1: Create the copy script in `packages/extension-chrome/scripts/copy-html.mjs`**

```javascript
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const shellRoot = resolve(here, "..");
const sharedHtmlDir = resolve(shellRoot, "../extension-shared/src");
const targetDir = resolve(shellRoot, "src");

if (!existsSync(sharedHtmlDir)) {
  throw new Error(`shared html dir not found: ${sharedHtmlDir}`);
}
mkdirSync(targetDir, { recursive: true });
for (const file of ["popup.html", "options.html"]) {
  copyFileSync(resolve(sharedHtmlDir, file), resolve(targetDir, file));
}
console.log("[chrome] copied popup.html + options.html from extension-shared");
```

- [ ] **Step 2: Same script for Firefox** — `packages/extension-firefox/scripts/copy-html.mjs` (identical except the log prefix says `[firefox]`).

- [ ] **Step 3: Wire the script via `prebuild` + `predev` hooks**

In `packages/extension-chrome/package.json`, modify `scripts`:

```json
"scripts": {
  "predev": "node ./scripts/copy-html.mjs",
  "dev": "vite",
  "prebuild": "node ./scripts/copy-html.mjs",
  "build": "vite build",
  "preview": "vite preview",
  "pretypecheck": "node ./scripts/copy-html.mjs",
  "typecheck": "tsc -p tsconfig.json --noEmit",
  "test": "vitest run",
  "test:watch": "vitest",
  "e2e": "node ./scripts/copy-html.mjs && playwright test"
}
```

For `packages/extension-firefox/package.json`, similar additions plus the existing manifest copy:

```json
"scripts": {
  "predev": "node ./scripts/copy-html.mjs",
  "dev": "vite",
  "prebuild": "node ./scripts/copy-html.mjs",
  "build": "vite build && node ./scripts/copy-manifest.mjs",
  "preview": "vite preview",
  "pretypecheck": "node ./scripts/copy-html.mjs",
  "typecheck": "tsc -p tsconfig.json --noEmit",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

Adapt to whatever each `package.json` currently contains — the goal is "copy-html runs before any command that reads `src/*.html`."

- [ ] **Step 4: Delete the duplicate files**

```bash
rm packages/extension-chrome/src/popup.html packages/extension-chrome/src/options.html
rm packages/extension-firefox/src/popup.html packages/extension-firefox/src/options.html
```

- [ ] **Step 5: Update `.gitignore` in each shell**

Append to `packages/extension-chrome/.gitignore` and `packages/extension-firefox/.gitignore`:

```
src/popup.html
src/options.html
```

- [ ] **Step 6: Verify each build still works**

```bash
pnpm --filter @gitmarks/core build
pnpm --filter @gitmarks/extension-chrome build
pnpm --filter @gitmarks/extension-firefox build
```

Both shells emit `dist/popup.html` + `dist/options.html` (or the crxjs-mangled equivalents). The hidden `src/popup.html` reappears after `prebuild` runs — that's fine; it's now a build artifact.

Run the full pipeline:

```bash
pnpm typecheck
pnpm test
```

All green.

- [ ] **Step 7: Commit**

```bash
git checkout -b feat/hygiene-and-hardening
git add packages/extension-chrome packages/extension-firefox
git commit -m "fix(ext): dedupe popup.html + options.html via copy-html prebuild script"
```

---

## Task 2: Type-position migration `chrome.*` → `browser.*` (#34)

Five files in `extension-shared` still have `chrome.bookmarks.*` / `chrome.runtime.LastError` type annotations from before the `browser.*` value-position migration. Plus `test/setup.ts` references `chrome.bookmarks.BookmarkCreateArg` etc.

**Strategy:** import the `Bookmarks` and `Runtime` namespaces from `webextension-polyfill` and use them in type position. After migration, drop `@types/chrome` from all three extension packages' devDeps and tsconfig `types` arrays.

**Files:**
- Modify: `packages/extension-shared/src/lib/apply-remote.ts`
- Modify: `packages/extension-shared/src/lib/listeners.ts`
- Modify: `packages/extension-shared/src/lib/reconcile.ts`
- Modify: `packages/extension-shared/test/setup.ts`
- Modify: `packages/extension-shared/tsconfig.json` (drop `"chrome"` from types)
- Modify: `packages/extension-shared/package.json` (drop `@types/chrome`)
- Modify: `packages/extension-chrome/tsconfig.json`
- Modify: `packages/extension-chrome/package.json`
- Modify: `packages/extension-firefox/tsconfig.json`
- Modify: `packages/extension-firefox/package.json`

- [ ] **Step 1: Migrate type-position refs in `apply-remote.ts`**

Find:
```typescript
let current: chrome.bookmarks.BookmarkTreeNode | undefined;
```

Replace by adding to the imports at the top:
```typescript
import type { Bookmarks } from "webextension-polyfill";
```

And changing the line to:
```typescript
let current: Bookmarks.BookmarkTreeNode | undefined;
```

- [ ] **Step 2: Migrate type-position refs in `listeners.ts`**

Add the same `import type { Bookmarks } from "webextension-polyfill";` at the top.

Replace:
- `chrome.bookmarks.BookmarkTreeNode` → `Bookmarks.BookmarkTreeNode`
- `chrome.bookmarks.BookmarkChangeInfo` → `Bookmarks.OnChangedChangeInfoType`
- `chrome.bookmarks.BookmarkMoveInfo` → `Bookmarks.OnMovedMoveInfoType`
- `chrome.bookmarks.BookmarkRemoveInfo` → `Bookmarks.OnRemovedRemoveInfoType`

(The polyfill's type names differ from `@types/chrome`'s — verify the exact names against `node_modules/webextension-polyfill/index.d.ts` if the typecheck fails.)

- [ ] **Step 3: Migrate type-position ref in `reconcile.ts`**

Add `import type { Bookmarks } from "webextension-polyfill";` and replace `chrome.bookmarks.BookmarkTreeNode` → `Bookmarks.BookmarkTreeNode`.

- [ ] **Step 4: Migrate `test/setup.ts`**

The current setup.ts uses `chrome.bookmarks.BookmarkCreateArg`, `chrome.bookmarks.BookmarkTreeNode`, `chrome.runtime.LastError`. Add:

```typescript
import type { Bookmarks, Runtime } from "webextension-polyfill";
```

Replace:
- `chrome.bookmarks.BookmarkCreateArg` → `Bookmarks.CreateDetails`
- `chrome.bookmarks.BookmarkTreeNode` → `Bookmarks.BookmarkTreeNode`
- `chrome.runtime.LastError` → `Runtime.PropertyLastErrorType` (or whatever the polyfill exports — verify)

The stub's runtime `lastError` field can be typed as `Runtime.PropertyLastErrorType | undefined` or simply `{ message: string } | undefined` if the polyfill doesn't expose a matching type.

- [ ] **Step 5: Drop `@types/chrome` from devDeps + tsconfig**

In `packages/extension-shared/package.json`, `packages/extension-chrome/package.json`, `packages/extension-firefox/package.json`:
- Remove `"@types/chrome": "^0.0.268"` from `devDependencies`.

In each package's `tsconfig.json`:
- Remove `"chrome"` from the `compilerOptions.types` array. If `types` is now empty, drop the key entirely.

- [ ] **Step 6: Verify**

```bash
pnpm install   # syncs the dropped dep
pnpm --filter @gitmarks/core build
pnpm typecheck
pnpm test
pnpm build
```

All green. `chrome.*` type-position refs should be gone from `extension-shared`.

Sanity-check via grep: `grep -RIn "chrome\." packages/extension-shared/src` should return zero hits for type-position uses (it's OK if value uses still appear in `popup.ts` etc. via the polyfill — but they shouldn't, since FF-2 migrated those).

- [ ] **Step 7: Commit**

```bash
git add packages/extension-shared packages/extension-chrome packages/extension-firefox
git commit -m "refactor(ext-shared): migrate chrome.* type refs to webextension-polyfill namespace; drop @types/chrome"
```

---

## Task 3: Test assertion namespace cleanup (#35)

14 assertions across 3 test files reference `chrome.bookmarks.create` / `chrome.runtime.openOptionsPage` etc. directly. They pass today because the test setup stubs both `globalThis.chrome` and `globalThis.browser` to the same object. Production calls `browser.*`; rewrite the assertions to match.

**Files:**
- Modify: `packages/extension-shared/test/apply-remote.test.ts`
- Modify: `packages/extension-shared/test/listeners.test.ts`
- Modify: `packages/extension-shared/test/reconcile.test.ts`

- [ ] **Step 1: Find and replace in each test file**

For each of the three files, replace every `chrome.bookmarks.X` reference with `browser.bookmarks.X`. Run `grep -n "chrome\." packages/extension-shared/test/` to enumerate. Each `expect(chrome.bookmarks.create).toHaveBeenCalled...` becomes `expect(browser.bookmarks.create)...`.

Use the Edit tool. Examples:

```typescript
// before
expect(chrome.bookmarks.create).toHaveBeenCalledWith({...});
// after
expect(browser.bookmarks.create).toHaveBeenCalledWith({...});
```

(`browser` is already a globalThis stub from `test/setup.ts`.)

`settings.test.ts` and `machine-id.test.ts` use `chrome.storage.local.*` in their assertions — migrate those too.

- [ ] **Step 2: Verify**

```bash
pnpm --filter @gitmarks/extension-shared test
```

96 tests should still pass — the underlying stub object is the same; we just changed the access path.

Also run `grep -RIn "chrome\." packages/extension-shared/test` to confirm zero remaining hits (except in any intentional polyfill-shim test).

- [ ] **Step 3: Commit**

```bash
git add packages/extension-shared/test
git commit -m "test(ext-shared): assert against browser.* mock paths to match production calls"
```

---

## Task 4: CSP on web UI + extension manifests (#39 item 1+2)

Defense-in-depth content security policies.

**Files:**
- Modify: `packages/web/index.html`
- Modify: `packages/extension-chrome/manifest.config.ts`
- Modify: `packages/extension-firefox/manifest.json`

- [ ] **Step 1: Add CSP meta tag to `packages/web/index.html`**

Inside the `<head>` block, before `<title>`:

```html
<meta
  http-equiv="Content-Security-Policy"
  content="default-src 'self'; connect-src https://api.github.com; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'; object-src 'none';"
/>
```

Notes for the implementer:
- `connect-src https://api.github.com` — only allow the GitHub API host. Blocks any exfil to other hosts.
- `style-src 'self' 'unsafe-inline'` — Tailwind needs inline styles; tighter is a follow-up.
- `script-src 'self'` — disallows inline scripts.
- `img-src 'self' data:` — favicons / embedded SVG ok.
- `frame-ancestors 'none'` — clickjacking defense.
- `object-src 'none'` — defends against plugin-based attacks.

After this, run `pnpm --filter @gitmarks/web build && pnpm --filter @gitmarks/web preview`. Open the preview URL; confirm no CSP violations in the browser console. If a violation appears (e.g., the Vite-built CSS uses an inline `<style>` element that needs `style-src 'self' 'unsafe-inline'` — already covered), document and proceed.

- [ ] **Step 2: Add explicit CSP to Chrome manifest**

`packages/extension-chrome/manifest.config.ts` — extend the `defineManifest` object:

```typescript
export default defineManifest({
  // …existing keys…
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self'; connect-src https://api.github.com",
  },
});
```

(MV3's default is already `script-src 'self'`; we're making it explicit and adding the `connect-src` allowlist so popups/options pages cannot reach hosts other than the GitHub API.)

- [ ] **Step 3: Add explicit CSP to Firefox manifest**

`packages/extension-firefox/manifest.json` — add:

```json
"content_security_policy": {
  "extension_pages": "script-src 'self'; object-src 'self'; connect-src https://api.github.com"
}
```

- [ ] **Step 4: Verify**

```bash
pnpm typecheck
pnpm test
pnpm build
```

All green. Both extension builds emit manifests containing the CSP.

- [ ] **Step 5: Commit**

```bash
git add packages/web/index.html packages/extension-chrome/manifest.config.ts packages/extension-firefox/manifest.json
git commit -m "feat(security): explicit CSP on web index.html and both extension manifests"
```

---

## Task 5: Sign out / clear local data button in web UI (#39 item 3)

`clearSettings()` exists but is unreachable from the UI. Add a button in `Layout` that calls it, then navigates to `/setup`.

**Files:**
- Modify: `packages/web/src/components/Layout.tsx`
- Modify: `packages/web/src/routes/{ListPage,TagsPage,TrashPage}.tsx`
- Modify: `packages/web/test/components.Layout.test.tsx`

- [ ] **Step 1: Add failing test to `packages/web/test/components.Layout.test.tsx`**

Append inside the existing `describe("Layout", …)`:

```typescript
  it("renders a Sign out button when onSignOut is provided and invokes it", async () => {
    const onSignOut = vi.fn();
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Layout
          status={{ kind: "ok", message: "synced" }}
          onRefresh={() => {}}
          onSignOut={onSignOut}
          refreshing={false}
        >
          <div />
        </Layout>
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: /sign out/i }));
    expect(onSignOut).toHaveBeenCalled();
  });
```

Run: `pnpm --filter @gitmarks/web test test/components.Layout.test.tsx`. Expected: FAIL.

- [ ] **Step 2: Add the `onSignOut` prop to `Layout`**

In `packages/web/src/components/Layout.tsx`:

```typescript
interface Props {
  children: ReactNode;
  status: LayoutStatus;
  onRefresh: () => void;
  onExport?: () => void;
  onSignOut?: () => void;
  refreshing: boolean;
}
```

In the header's right-side div, add the Sign out button after Export (and before Sync):

```typescript
{onSignOut !== undefined && (
  <button
    type="button"
    onClick={onSignOut}
    className="px-3 py-1 rounded border border-magenta text-magenta hover:bg-magenta hover:text-ink"
  >
    Sign out
  </button>
)}
```

(Magenta = same "danger" colorway used for Move-to-trash. Sign-out is irreversible without re-entering the PAT.)

- [ ] **Step 3: Wire `onSignOut` in each page**

In `packages/web/src/routes/ListPage.tsx`, `TagsPage.tsx`, and `TrashPage.tsx`, add:

```typescript
import { useNavigate } from "react-router-dom";
import { clearSettings } from "../lib/settings.js";

// inside the component:
const navigate = useNavigate();
function onSignOut() {
  clearSettings();
  navigate("/setup");
}

// pass onSignOut to Layout:
<Layout status={status} onRefresh={onRefresh} onExport={onExport} onSignOut={onSignOut} refreshing={refreshing}>
```

- [ ] **Step 4: Verify**

```bash
pnpm --filter @gitmarks/web test
pnpm --filter @gitmarks/web typecheck
```

All previous + 1 new = pass.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/Layout.tsx packages/web/src/routes/ListPage.tsx packages/web/src/routes/TagsPage.tsx packages/web/src/routes/TrashPage.tsx packages/web/test/components.Layout.test.tsx
git commit -m "feat(web): sign-out button that clears localStorage and returns to setup"
```

---

## Task 6: PAT-lifecycle README notes (#39 item 4)

Document that extension uninstall does NOT clear `chrome.storage.local` (it does in practice — but the storage was already isolated; the PAT in github.com remains valid until the user revokes it). Steer users to revoke on github.com.

**Files:**
- Modify: `README.md`
- Modify: `packages/extension-chrome/README.md`
- Modify: `packages/extension-firefox/README.md`

- [ ] **Step 1: Add a section to root `README.md`**

Find the "## Your data, your PAT" section. After the existing bullets, append:

```markdown
### PAT lifecycle / revocation

When you stop using gitmarks (uninstall the extension, clear browser data, or switch machines):

1. **Revoke the PAT on github.com.** Settings → Developer settings → Personal access tokens → Fine-grained tokens → find the one named for your bookmarks repo → **Delete**. This is the only authoritative way to invalidate the credential.
2. **Web UI:** click **Sign out** in the header. This clears `localStorage` on your current machine. (It does NOT revoke the token on GitHub — see step 1.)
3. **Extension:** uninstalling the extension removes its `chrome.storage.local` entry on that machine. The token on GitHub remains valid until you revoke it.

Treat the PAT like a saved password. If a machine is lost or compromised, revoke immediately on github.com.
```

- [ ] **Step 2: Add a brief revoke-on-uninstall note to each extension README**

In both `packages/extension-chrome/README.md` and `packages/extension-firefox/README.md`, find the "First-run setup" section. After it, add (if not already present):

```markdown
## Uninstall

Removing the extension clears `chrome.storage.local` (or the Firefox equivalent) for this browser profile. **It does NOT revoke your GitHub PAT** — that token remains valid on github.com until you delete it manually:

1. github.com → Settings → Developer settings → Personal access tokens → Fine-grained tokens.
2. Find the token you created for gitmarks → **Delete**.
```

- [ ] **Step 3: Verify + commit**

```bash
git add README.md packages/extension-chrome/README.md packages/extension-firefox/README.md
git commit -m "docs: document PAT lifecycle and revocation on uninstall"
```

---

## Task 7: URL safety at apply-remote boundary (#39 item 5)

The extension's `apply-remote.ts` writes remote bookmarks to `chrome.bookmarks` via `browser.bookmarks.create({ url, … })`. Chrome accepts any URL string, including `javascript:`. If a remote `bookmarks.json` contains a malicious entry, the user's native bookmarks tree now has a clickable script payload.

**Strategy:** Use `isSafeBookmarkUrl` from `@gitmarks/core` at the apply-remote boundary. Skip + log unsafe entries; the local tree never sees them.

**Files:**
- Modify: `packages/extension-shared/src/lib/apply-remote.ts`
- Modify: `packages/extension-shared/test/apply-remote.test.ts`

- [ ] **Step 1: Add a failing test to `packages/extension-shared/test/apply-remote.test.ts`**

Append to the existing `describe(...)`:

```typescript
  it("skips bookmarks with unsafe URL schemes (javascript:, data:)", async () => {
    const remote: BookmarksFile = {
      version: 1,
      updated_at: "2026-05-25T00:00:00Z",
      bookmarks: [
        mkBookmark({ id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CA", url: "javascript:alert(1)" }),
        mkBookmark({ id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CB", url: "https://example.com/safe" }),
        mkBookmark({ id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CC", url: "data:text/html,<script>1</script>" }),
      ],
    };
    const idMap = makeIdMap();
    await applyRemoteChanges(remote, idMap, "bar-1", "other-1");
    const calls = (browser.bookmarks.create as Mock).mock.calls;
    const urls = calls.map((c) => c[0].url);
    expect(urls).toContain("https://example.com/safe");
    expect(urls).not.toContain("javascript:alert(1)");
    expect(urls).not.toContain(expect.stringMatching(/^data:/));
  });
```

Adapt to whatever helpers the existing test file uses (`mkBookmark`, `makeIdMap`, etc.).

- [ ] **Step 2: Add the URL safety filter to `apply-remote.ts`**

At the top of the file:

```typescript
import { isSafeBookmarkUrl } from "@gitmarks/core";
```

Inside `applyRemoteChanges`, in the loop over `remote.bookmarks`, after extracting `bm`:

```typescript
for (const bm of remote.bookmarks) {
  if (bm.deleted_at == null && !isSafeBookmarkUrl(bm.url)) {
    console.warn("[gitmarks] skipping remote bookmark with unsafe URL scheme", {
      ulid: bm.id, url: bm.url,
    });
    continue;
  }
  // …existing logic…
}
```

(Place the guard AFTER the `deleted_at` check so tombstones still propagate — removing a previously-safe local bookmark whose REMOTE entry has been corrupted to `javascript:` should still cleanly delete the local node.)

Wait — re-reading: if `deleted_at != null` AND url is unsafe, we still want to handle the soft delete (remove the local node if it exists). The simpler check: only validate URL when we're about to CREATE or UPDATE. The existing flow:

```typescript
if (bm.deleted_at != null) { /* delete branch */ continue; }
if (existingNode != null) { /* update branch */ continue; }
/* create branch */
```

Add the URL safety check before EACH of the create/update branches that actually touch `browser.bookmarks` with a URL. Or, simpler: add a single guard right after the delete-branch handles its case:

```typescript
for (const bm of remote.bookmarks) {
  if (bm.deleted_at != null) {
    // …existing delete logic — runs even if URL is unsafe…
    continue;
  }
  if (!isSafeBookmarkUrl(bm.url)) {
    console.warn("[gitmarks] skipping remote bookmark with unsafe URL scheme", { ulid: bm.id, url: bm.url });
    continue;
  }
  // …existing create/update logic…
}
```

- [ ] **Step 3: Also guard `applyRemoteEdit` against unsafe remote URLs**

In `applyRemoteEdit(nodeId, remoteUrl, remoteTitle)`, before the `changes` object is built:

```typescript
if (!isSafeBookmarkUrl(remoteUrl)) {
  console.warn("[gitmarks] skipping remote edit with unsafe URL scheme", { nodeId, url: remoteUrl });
  return;
}
```

(This prevents an existing safe bookmark from being silently rewritten to a `javascript:` URL on a remote update.)

- [ ] **Step 4: Verify**

```bash
pnpm --filter @gitmarks/core build
pnpm --filter @gitmarks/extension-shared test
pnpm --filter @gitmarks/extension-shared typecheck
```

All previous + 1 new test pass.

- [ ] **Step 5: Commit**

```bash
git add packages/extension-shared/src/lib/apply-remote.ts packages/extension-shared/test/apply-remote.test.ts
git commit -m "fix(security): filter unsafe URL schemes at apply-remote boundary"
```

---

## Task 8: Docs + roadmap update

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md` (optional — only if test counts changed substantially)

- [ ] **Step 1: Update `CLAUDE.md` "Project status"**

Refresh the test totals to the new numbers. Get them from `pnpm test 2>&1 | tail -10`. Update the per-package counts and the overall total.

- [ ] **Step 2: Note the security posture in CLAUDE.md**

Find the "Load-bearing invariants" section. After the existing bullets, add:

```markdown
- **URL safety:** Bookmark URLs are checked against an allowlist of safe schemes (`isSafeBookmarkUrl` in `@gitmarks/core`) at (a) save time in the extension's `buildBookmark` factory, (b) render time in the web UI's `BookmarkRow`, and (c) the extension's `apply-remote` boundary that writes remote entries into the native bookmark tree. Unsafe schemes (`javascript:`, `data:`, etc.) are rejected/skipped.
- **Remote file validation:** `useGitmarksData` re-validates `bookmarks.json` and `tags.json` through Zod (`bookmarksFileSchema` / `tagsFileSchema`) after reading from GitHub. Malformed remote data surfaces as an error rather than rendering attacker-controlled fields.
- **Tag color guard:** `TagChip` regex-validates the color string before placing it into a CSS `style` object; malformed colors fall back to a default.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: refresh test counts and document security posture"
```

---

## Final Verification

- [ ] **Run the full pipeline at repo root**

```bash
pnpm install
pnpm --filter @gitmarks/core build
pnpm typecheck
pnpm test
pnpm build
```

All five green.

- [ ] **Open the PR**

```bash
git push -u origin feat/hygiene-and-hardening
gh pr create --title "fix: hygiene + security follow-ups (closes #33, #34, #35, #39)" --body "$(cat <<'EOF'
## Summary
- **#33** — HTML duplication: single source in `@gitmarks/extension-shared`; shells copy at build time.
- **#34** — `chrome.*` type-position refs migrated to `webextension-polyfill`'s namespace; `@types/chrome` dropped from all three extension packages.
- **#35** — Test assertions rewritten to target `browser.bookmarks.*` instead of `chrome.bookmarks.*`.
- **#39** — Defense-in-depth security: CSP meta on web index.html + extension manifests; sign-out button in web UI; PAT-lifecycle docs; unsafe URLs filtered at `apply-remote` boundary.

Closes #33, #34, #35, #39.

## Test plan
- [x] Full monorepo green (typecheck + test + build).
- [ ] Manual smoke test: load both extensions; web UI's CSP doesn't break dev or built preview; Sign out clears settings.
- [ ] Manual smoke test: edit a remote `bookmarks.json` to add a `javascript:` URL → the extension's poll skips it (warns in console) and never creates the bookmark in the native tree.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Wait for CI green, then merge with a merge commit.

---

## Cross-Reference

| Issue | Task |
|---|---|
| #33 HTML dedup | Task 1 |
| #34 chrome.* type refs | Task 2 |
| #35 test assertion namespace | Task 3 |
| #39 item 1 (CSP web) | Task 4 |
| #39 item 2 (CSP manifests) | Task 4 |
| #39 item 3 (sign-out button) | Task 5 |
| #39 item 4 (PAT lifecycle README) | Task 6 |
| #39 item 5 (apply-remote URL filter) | Task 7 |

## Notes for the implementer

- Tasks 1, 2, 3 are interlocking: Task 1 changes how HTML lands in shells, Task 2 changes types, Task 3 changes tests. Do them in order.
- Task 7 depends on Task 2 being done first (it imports `isSafeBookmarkUrl` which already lives in core; Task 2 just needs to not have broken anything when dropping `@types/chrome`).
- The Vite build of the Firefox shell expects `src/popup.html` and `src/options.html` to exist at the moment Vite starts. The `prebuild` script handles `pnpm build`; for `pnpm dev` to work, `predev` runs first.
- If the polyfill type names differ from the spec text (e.g., `Bookmarks.OnChangedChangeInfoType` doesn't exist), grep `node_modules/webextension-polyfill/index.d.ts` for the right name. Update the plan inline if you find a mismatch — it's a documentation-only correction.
