# Gitmarks Firefox Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@gitmarks/extension-firefox` — a Firefox MV3 add-on that does everything the Chrome extension does (popup save, two-way native-tree sync via `browser.bookmarks.*`, 5-minute poll, initial reconciliation, opt-in tracking-param stripping). Achieve this without code duplication by extracting the bulk of extension code into a new `@gitmarks/extension-shared` workspace package and turning `extension-chrome` + `extension-firefox` into thin browser-specific shells.

**Architecture:** Three workspace packages where there were two — `@gitmarks/core` (unchanged), `@gitmarks/extension-shared` (new: all the cross-browser code), `@gitmarks/extension-chrome` (manifest + vite config + thin entries; imports from extension-shared), `@gitmarks/extension-firefox` (mirror of chrome's shell, Firefox-specific manifest). `webextension-polyfill` lets source code use `browser.*` everywhere; Chrome's `chrome.*` is auto-aliased.

**Tech Stack:** TypeScript ESM throughout, `webextension-polyfill@^0.10`, Vite + `@crxjs/vite-plugin` for Chrome, Vite + manual manifest bundling for Firefox (crxjs is Chrome-only). Firefox 121+ for SW parity.

**Spec reference:** `spec.md` §"Build order" — Firefox build (~½ day). Issue #23.

**Out of scope (deferred to later plans / issues):**
- AMO signing / distribution beyond developer-mode unpacked
- Cross-browser Playwright e2e (unit tests cover shared logic; manual smoke verifies Firefox wiring)
- Older Firefox event-page fallback for pre-121 — only target MV3 SW for now

---

## Decisions locked in upfront

- **Polyfill at runtime, not at type level.** Source uses `browser.*` and imports the polyfill at the top of each entry (`background`, `popup`, `options`). TypeScript types from `webextension-polyfill` provide compile-time signatures. This avoids a build-time codemod and keeps both browsers' code paths identical.
- **`extension-shared` is workspace-private.** `"private": true`, no published exports config — it's an internal monorepo package consumed via `"@gitmarks/extension-shared": "workspace:*"`. Tree-shaking lets the shells pull only what each entry needs.
- **The shells own their manifests and Vite configs.** Each browser's `manifest.config.ts` + `vite.config.ts` live in its own package. The shared package owns no manifest — it's pure source.
- **Tests live with the shared package**, not the shells. `extension-shared/test/` has the chrome-stub + all current unit tests. The shells have only e2e (Chrome) or manual smoke (Firefox).
- **No behavior change in Chrome** as part of this plan. The refactor is a code move; the polyfill is a no-op against `chrome.*`. Every step keeps the existing 97 extension unit tests + 4 Playwright e2e green.
- **Firefox extension ID** is set in the manifest via `browser_specific_settings.gecko.id`. Use `gitmarks@paperhurts.dev` (placeholder; per spec the project ships as developer-mode unpacked first).

---

## File structure (final)

```
packages/
├── core/                                  # unchanged
├── extension-shared/                      # NEW: all cross-browser code
│   ├── package.json                       # name: @gitmarks/extension-shared
│   ├── tsconfig.json
│   ├── vitest.config.ts                   # moved from extension-chrome
│   ├── src/
│   │   ├── background.ts                  # moved
│   │   ├── popup.html                     # moved
│   │   ├── popup.ts                       # moved (browser.* via polyfill)
│   │   ├── options.html                   # moved
│   │   ├── options.ts                     # moved
│   │   └── lib/                           # all moved
│   │       ├── apply-remote.ts
│   │       ├── background-core.ts
│   │       ├── bookmark-factory.ts
│   │       ├── bookmarks-file.ts
│   │       ├── folder-path.ts
│   │       ├── id-mapping.ts
│   │       ├── listeners.ts
│   │       ├── machine-id.ts
│   │       ├── reconcile.ts
│   │       ├── save-flow.ts
│   │       ├── settings.ts
│   │       └── suppression.ts
│   └── test/                              # moved (chrome stub + 97 unit tests)
├── extension-chrome/                      # thin shell
│   ├── package.json                       # depends on extension-shared via workspace:*
│   ├── manifest.config.ts                 # MV3 chrome manifest
│   ├── vite.config.ts                     # crxjs plugin
│   ├── playwright.config.ts               # unchanged
│   ├── README.md                          # adjusted (manual smoke checklist points at shared)
│   └── e2e/                               # Chrome-only e2e stays here
│       ├── fixtures.ts
│       ├── github-mock.ts
│       ├── mvp.spec.ts
│       └── sync.spec.ts
└── extension-firefox/                     # NEW: thin Firefox shell
    ├── package.json                       # depends on extension-shared via workspace:*
    ├── manifest.json                      # MV3 Firefox manifest (JSON, no crxjs)
    ├── vite.config.ts                     # plain Vite multi-entry build
    ├── README.md                          # about:debugging dev workflow
    └── src/
        └── entries.ts                     # explicit import roots for each surface
```

---

## Tasks

### Task 0: Bootstrap `extension-shared` package skeleton (no migrations yet)

**Files:**
- Create: `packages/extension-shared/package.json`
- Create: `packages/extension-shared/tsconfig.json`
- Create: `packages/extension-shared/vitest.config.ts`
- Create: `packages/extension-shared/src/.gitkeep` (placeholder so the directory exists in git)
- Create: `packages/extension-shared/test/smoke.test.ts`

**Why this task exists separately:** establishes the package shell and proves the toolchain works before we move 97 tests + ~2k LoC into it.

- [ ] **Step 1: Create `packages/extension-shared/package.json`**

```json
{
  "name": "@gitmarks/extension-shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@gitmarks/core": "workspace:*",
    "webextension-polyfill": "^0.12.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/chrome": "^0.0.268",
    "@types/webextension-polyfill": "^0.12.0",
    "jsdom": "^25.0.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `packages/extension-shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["chrome", "vite/client"],
    "rootDir": "./",
    "outDir": "./dist-tsc",
    "noEmit": true
  },
  "include": ["src/**/*.ts", "test/**/*.ts", "vitest.config.ts"]
}
```

(Note: we keep `@types/chrome` in `types` even though we're switching to `browser.*` — `@types/webextension-polyfill` re-exports the chrome types for compatibility, and the existing chrome stub in tests still references `chrome.bookmarks.BookmarkTreeNode` etc.)

- [ ] **Step 3: Create `packages/extension-shared/vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
    globals: false,
  },
});
```

(`setup.ts` doesn't exist yet — Task 1 moves it. For now, vitest will error on the missing setupFiles entry. The smoke test in Step 5 below works around that by deferring config use until Task 1.)

- [ ] **Step 4: Create `packages/extension-shared/src/.gitkeep`**

Empty file. Just `touch packages/extension-shared/src/.gitkeep`.

- [ ] **Step 5: Create `packages/extension-shared/test/smoke.test.ts` and a stub `test/setup.ts`**

Stub setup (will be replaced by the real one in Task 1):

```typescript
// packages/extension-shared/test/setup.ts (stub — replaced in Task 1)
// Empty placeholder so vitest's setupFiles entry resolves.
export {};
```

Smoke test:

```typescript
// packages/extension-shared/test/smoke.test.ts
import { describe, it, expect } from "vitest";

describe("@gitmarks/extension-shared smoke", () => {
  it("loads without errors", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Install + verify**

Run: `pnpm install`

Expected: pnpm fetches `webextension-polyfill`, `@types/webextension-polyfill`, and resolves `@gitmarks/extension-shared` as a workspace package.

Run: `pnpm --filter @gitmarks/extension-shared test`
Expected: 1 test passes.

Run: `pnpm --filter @gitmarks/extension-shared typecheck`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add packages/extension-shared pnpm-lock.yaml
git commit -m "chore(extension-shared): bootstrap workspace package skeleton

Pre-cursor to extracting the cross-browser extension code out of
extension-chrome so that extension-firefox (issue #23) can consume the
same source without duplication. This commit creates only the package
shell + a smoke test; subsequent tasks move code into it."
```

---

### Task 1: Move `chrome.*` test stub and unit tests to extension-shared

**Files:**
- Move: `packages/extension-chrome/test/setup.ts` → `packages/extension-shared/test/setup.ts`
- Move: `packages/extension-chrome/test/*.test.ts` (12 files) → `packages/extension-shared/test/`

**Why this task:** The 97 unit tests are package-agnostic — they test pure modules + the chrome stub. Moving them first means the rest of the refactor is verified by an already-passing suite living in its new home.

**Critical:** the test files currently import via relative paths like `"../src/lib/settings.js"`. After the move, those paths must still resolve. Since `src/` is moving in Task 2, the imports need a temporary adjustment OR the tests + src move together.

**Cleaner approach:** move test + src together in Task 1. Re-scope Task 1 to:

- [ ] **Step 1: Move all source and tests in one atomic operation**

Use `git mv` to preserve history:

```bash
git mv packages/extension-chrome/src/background.ts packages/extension-shared/src/
git mv packages/extension-chrome/src/popup.html packages/extension-shared/src/
git mv packages/extension-chrome/src/popup.ts packages/extension-shared/src/
git mv packages/extension-chrome/src/options.html packages/extension-shared/src/
git mv packages/extension-chrome/src/options.ts packages/extension-shared/src/
git mv packages/extension-chrome/src/lib packages/extension-shared/src/lib
git rm packages/extension-shared/src/.gitkeep

git mv packages/extension-chrome/test/setup.ts packages/extension-shared/test/setup.ts
# Overwrite the stub setup we created in Task 0
git mv packages/extension-chrome/test/apply-remote.test.ts packages/extension-shared/test/
git mv packages/extension-chrome/test/background-core.test.ts packages/extension-shared/test/
git mv packages/extension-chrome/test/bookmark-factory.test.ts packages/extension-shared/test/
git mv packages/extension-chrome/test/bookmarks-file.test.ts packages/extension-shared/test/
git mv packages/extension-chrome/test/folder-path.test.ts packages/extension-shared/test/
git mv packages/extension-chrome/test/id-mapping.test.ts packages/extension-shared/test/
git mv packages/extension-chrome/test/listeners.test.ts packages/extension-shared/test/
git mv packages/extension-chrome/test/machine-id.test.ts packages/extension-shared/test/
git mv packages/extension-chrome/test/reconcile.test.ts packages/extension-shared/test/
git mv packages/extension-chrome/test/save-flow.test.ts packages/extension-shared/test/
git mv packages/extension-chrome/test/settings.test.ts packages/extension-shared/test/
git mv packages/extension-chrome/test/suppression.test.ts packages/extension-shared/test/
# smoke.test.ts in extension-chrome can be removed; extension-shared has its own
git rm packages/extension-chrome/test/smoke.test.ts 2>/dev/null || true
```

Note the imports inside the moved files use relative paths like `"../src/lib/settings.js"` — those still resolve because the relative position (`test/` ↔ `src/lib/`) is unchanged inside extension-shared.

- [ ] **Step 2: Make extension-shared export the public API**

Create `packages/extension-shared/src/index.ts`:

```typescript
// Re-exports so the browser-specific shells can import everything they need
// from one place. Keep this in alphabetical order; if you add a new public
// surface in src/lib/, add it here.

export { applyRemoteChanges } from "./lib/apply-remote.js";
export * from "./lib/background-core.js";
export { buildBookmark, type BuildBookmarkInput } from "./lib/bookmark-factory.js";
export {
  BOOKMARKS_PATH,
  emptyBookmarksFile,
  updateBookmarksOrBootstrap,
} from "./lib/bookmarks-file.js";
export {
  BOOKMARKS_BAR_FOLDER,
  OTHER_BOOKMARKS_FOLDER,
  folderPathFromNode,
  splitFolderPath,
  type SplitPath,
  type TreeNode,
} from "./lib/folder-path.js";
export {
  IdMap,
  asNodeId,
  asUlid,
  type NodeId,
  type Ulid,
} from "./lib/id-mapping.js";
export {
  flushPending,
  registerListeners,
  __resetForTest,
  type ListenerDeps,
} from "./lib/listeners.js";
export { getMachineId } from "./lib/machine-id.js";
export { reconcile } from "./lib/reconcile.js";
export {
  saveBookmark,
  type PageInfo,
  type SaveOptions,
  type SaveResult,
} from "./lib/save-flow.js";
export {
  SettingsCorruptError,
  clearSettings,
  loadSettings,
  saveSettings,
  settingsSchema,
  type Settings,
} from "./lib/settings.js";
export {
  clearSuppression,
  isNodeSuppressed,
  isSuppressed,
  suppress,
  suppressNode,
} from "./lib/suppression.js";
```

- [ ] **Step 3: Update extension-chrome's `vitest.config.ts` and remove its now-empty test dir + setup**

Since extension-chrome no longer has unit tests of its own (everything moved to extension-shared), delete its `vitest.config.ts` and the now-empty `test/` directory. Keep `e2e/` and `playwright.config.ts`.

```bash
git rm packages/extension-chrome/vitest.config.ts
# test/ should be empty now after Step 1's moves; rmdir explicitly
rmdir packages/extension-chrome/test 2>/dev/null || true
```

Edit `packages/extension-chrome/package.json` to remove the `test` and `test:watch` scripts and the vitest devDep — extension-chrome's test surface is now just e2e:

```json
{
  "name": "@gitmarks/extension-chrome",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "vite build",
    "dev": "vite build --watch --mode development",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "e2e": "playwright test",
    "e2e:headed": "playwright test --headed",
    "pretest:e2e": "vite build"
  },
  "dependencies": {
    "@gitmarks/core": "workspace:*",
    "@gitmarks/extension-shared": "workspace:*",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@crxjs/vite-plugin": "^2.4.0",
    "@playwright/test": "^1.48.0",
    "@types/chrome": "^0.0.268",
    "vite": "^5.4.0"
  }
}
```

(Note: we keep `zod` as a direct dep because the popup imports `SettingsCorruptError` from the shared package, and any Settings construction also depends on zod transitively. Easier to keep it visible than rely on transitive resolution. `jsdom` and `vitest` are now in extension-shared.)

- [ ] **Step 4: Update extension-chrome's source entries to import from `@gitmarks/extension-shared`**

The current `src/background.ts`, `src/popup.ts`, `src/options.ts`, and the `manifest.config.ts` references to them all still exist in extension-chrome temporarily — actually wait, they were moved to extension-shared in Step 1.

**The shell needs its own thin entry files** that import from the shared package. Create:

`packages/extension-chrome/src/background.ts`:
```typescript
// Chrome shell entry — re-exports the shared background module so the
// MV3 manifest can point at this file and crxjs can package it cleanly.
import "@gitmarks/extension-shared/dist/background.js";
```

Wait — that's wrong. `extension-shared` has no build step (we set `noEmit: true` in its tsconfig). The shell needs to either:
- (a) directly import the .ts source via TypeScript path resolution (works with crxjs because vite handles TS)
- (b) emit a dist/ for extension-shared

Option (a) is cleaner. Adjust extension-chrome's tsconfig.json to add path mapping:

Wait — even simpler. The shell entry just imports the side-effecting modules. Since `@gitmarks/extension-shared` has `"type": "module"` and points its main at a file we control, we can have the shared package expose `./background.js`, `./popup.js`, `./options.js` as subpath exports of the SOURCE (no build).

Actually let me reconsider. `vite build` (which extension-chrome uses) handles TypeScript natively when given a `.ts` entry. So extension-chrome's entry can simply re-export from extension-shared via TS imports:

`packages/extension-chrome/src/background.ts`:
```typescript
import "@gitmarks/extension-shared/src/background";
```

But `@gitmarks/extension-shared/src/background` needs to be importable. Add an `exports` map to `extension-shared/package.json`:

```json
{
  "name": "@gitmarks/extension-shared",
  ...
  "exports": {
    "./src/background": "./src/background.ts",
    "./src/popup": "./src/popup.ts",
    "./src/options": "./src/options.ts",
    ".": "./src/index.ts"
  }
}
```

Vite + TypeScript can resolve `.ts` from `exports` because vite handles TS transformation in-process.

Actually that's brittle. Cleaner: have the shells own thin entries that just import:

`packages/extension-chrome/src/background.ts`:
```typescript
// Shell entry — Chrome MV3 manifest points here. The actual implementation
// lives in @gitmarks/extension-shared; this file's side-effects (registering
// listeners, the alarm, the initial reconcile) come from importing it.
import "@gitmarks/extension-shared/background";
```

And the package.json exports:
```json
{
  "exports": {
    ".": "./src/index.ts",
    "./background": "./src/background.ts",
    "./popup": "./src/popup.ts",
    "./options": "./src/options.ts"
  }
}
```

- [ ] **Step 5: Update manifests + HTML to point at shell entries**

`packages/extension-chrome/manifest.config.ts` already points at `src/popup.html`, `src/options.html`, `src/background.ts`. We need to keep the manifest pointing at chrome's local shell — so create:

`packages/extension-chrome/src/popup.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>gitmarks</title>
  </head>
  <body>
    <main id="root">loading…</main>
    <script type="module" src="./popup.ts"></script>
  </body>
</html>
```

`packages/extension-chrome/src/popup.ts`:
```typescript
import "@gitmarks/extension-shared/popup";
```

`packages/extension-chrome/src/options.html`: same pattern.

`packages/extension-chrome/src/options.ts`:
```typescript
import "@gitmarks/extension-shared/options";
```

`packages/extension-chrome/src/background.ts`:
```typescript
import "@gitmarks/extension-shared/background";
```

(Note: the HTML files reference `./popup.ts` and `./options.ts` relative to the HTML — and those `.ts` files just re-export from the shared package. Vite handles the transitive TS resolution.)

- [ ] **Step 6: Run the suites + verify zero behavior change**

```bash
pnpm install   # pnpm sees the new exports + workspace dep
pnpm --filter @gitmarks/extension-shared test
# Expect: 97 tests passing
pnpm --filter @gitmarks/extension-shared typecheck
# Expect: exit 0
pnpm --filter @gitmarks/extension-chrome typecheck
# Expect: exit 0
pnpm --filter @gitmarks/extension-chrome build
# Expect: clean build, dist/manifest.json + dist/src/popup.html + assets emitted
pnpm --filter @gitmarks/extension-chrome e2e
# Expect: 4 passing, 2 skipped
```

If any test fails: the move broke something. Investigate before committing.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: extract extension-shared workspace package

Moves all of packages/extension-chrome/src (background, popup, options,
lib/) and packages/extension-chrome/test (chrome stub + 97 unit tests)
into a new @gitmarks/extension-shared workspace package. extension-chrome
becomes a thin shell with its own manifest, vite config, and entries
that re-export from extension-shared.

Why: extension-firefox (issue #23) needs the same source. Without this
refactor we would duplicate ~2k LoC across browsers.

No behavior change. All 97 unit tests still pass; all 4 Playwright e2e
tests still pass (2 documented skips remain). extension-chrome's
dist/manifest.json is unchanged."
```

---

### Task 2: Migrate `chrome.*` → `browser.*` via `webextension-polyfill`

**Files:**
- Modify: every `.ts` file in `packages/extension-shared/src/` and `packages/extension-shared/test/setup.ts`

**Why:** Firefox exposes `browser.*` natively; Chrome doesn't. `webextension-polyfill` exposes `browser.*` in Chrome via a thin wrapper over `chrome.*`. By switching all code to `browser.*`, the same source runs in both browsers.

**Strategy:** mechanical find-and-replace, BUT:
- The chrome stub in `test/setup.ts` is stubbing `chrome.*` — it must be reworked to stub `browser.*` instead (or to stub both, since the polyfill bridges them in production).
- The polyfill is async-by-default for callback-style APIs (it converts them to Promises). All our code already uses `await chrome.x.y(...)` so this is a no-op semantically.

- [ ] **Step 1: Add polyfill import to each entry file**

`packages/extension-shared/src/background.ts` (at top):
```typescript
import browser from "webextension-polyfill";
```

Same for `popup.ts`, `options.ts`. The import has side effects (registers the polyfill) AND exports the unified `browser` namespace.

- [ ] **Step 2: Replace `chrome.` with `browser.` across `src/`**

```bash
# From the repo root:
find packages/extension-shared/src -name '*.ts' -exec \
  sed -i 's/\bchrome\./browser./g' {} +
```

Inspect the diff carefully. Some occurrences are in COMMENTS (`// chrome.storage.local`); those don't need to change semantically but it's fine to update them for consistency. Some are TYPE references (`chrome.bookmarks.BookmarkTreeNode`) — those need different handling because `@types/chrome` namespace types aren't auto-mirrored. Resolve type imports via `@types/webextension-polyfill`'s `Browser.Bookmarks.BookmarkTreeNode` etc., OR keep the type imports as `chrome.*` since `@types/webextension-polyfill` re-exports compatibility types.

For pragmatism: keep `chrome.bookmarks.BookmarkTreeNode` etc. in type positions (they're still valid via @types/chrome), and only change the VALUE positions (`chrome.bookmarks.create(...)` → `browser.bookmarks.create(...)`). Refine the sed if it's too aggressive:

```bash
# More targeted: replace chrome. only when followed by a callable property
# (bookmarks/storage/runtime/etc.) AND not preceded by an import/type keyword.
# Easier: do the global replace, then revert the type-position regressions.
```

Use your judgment after running the find/replace. If types break, add `type Browser = typeof browser;` aliases or use the `@types/webextension-polyfill` type namespace.

- [ ] **Step 3: Replace the chrome stub with a browser stub in `test/setup.ts`**

The current stub registers a global `chrome` object. After the polyfill switch, source code reads `browser`. Update the stub to register both — `browser` for the new code paths and `chrome` for any straggler:

```typescript
// packages/extension-shared/test/setup.ts (excerpt)
const stub = {
  storage: { /* ... existing ... */ },
  runtime: { /* ... */ },
  bookmarks: { /* ... */ },
  alarms: { /* ... */ },
  tabs: { /* ... */ },
};

vi.stubGlobal("browser", stub);
vi.stubGlobal("chrome", stub);   // safety: any straggler still works
```

The `webextension-polyfill` runtime checks `globalThis.browser` first; setting it directly short-circuits the polyfill in tests (which we want — we're testing logic, not the polyfill).

- [ ] **Step 4: Verify**

```bash
pnpm --filter @gitmarks/extension-shared typecheck
# Expect: exit 0
pnpm --filter @gitmarks/extension-shared test
# Expect: 97 tests pass
pnpm --filter @gitmarks/extension-chrome build
# Expect: clean build
pnpm --filter @gitmarks/extension-chrome e2e
# Expect: 4 passing, 2 skipped — same as before
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(extension-shared): migrate chrome.* → browser.* via webextension-polyfill

Cross-browser code now uses browser.* uniformly. The polyfill aliases
chrome.* under browser.* in Chrome; Firefox exposes browser.* natively.

Tests' chrome stub now also exposes itself as 'browser' for the same
reason. No production behavior change in Chrome; this prepares the
source for consumption by extension-firefox (issue #23)."
```

---

### Task 3: Bootstrap `extension-firefox` package

**Files:**
- Create: `packages/extension-firefox/package.json`
- Create: `packages/extension-firefox/tsconfig.json`
- Create: `packages/extension-firefox/vite.config.ts`
- Create: `packages/extension-firefox/manifest.json` (literal JSON, not a TS config — crxjs is Chrome-only)
- Create: `packages/extension-firefox/src/background.ts`
- Create: `packages/extension-firefox/src/popup.html`
- Create: `packages/extension-firefox/src/popup.ts`
- Create: `packages/extension-firefox/src/options.html`
- Create: `packages/extension-firefox/src/options.ts`

- [ ] **Step 1: Create `packages/extension-firefox/package.json`**

```json
{
  "name": "@gitmarks/extension-firefox",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "vite build && node ./scripts/copy-manifest.mjs",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@gitmarks/core": "workspace:*",
    "@gitmarks/extension-shared": "workspace:*"
  },
  "devDependencies": {
    "@types/webextension-polyfill": "^0.12.0",
    "vite": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create `packages/extension-firefox/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["webextension-polyfill", "vite/client"],
    "rootDir": "./",
    "outDir": "./dist-tsc",
    "noEmit": true
  },
  "include": ["src/**/*.ts", "vite.config.ts", "scripts/**/*.mjs"]
}
```

- [ ] **Step 3: Create `packages/extension-firefox/vite.config.ts`**

```typescript
import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    outDir: "dist",
    target: "esnext",
    minify: false,
    sourcemap: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, "src/background.ts"),
        popup: resolve(__dirname, "src/popup.html"),
        options: resolve(__dirname, "src/options.html"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "[name].[ext]",
      },
    },
  },
});
```

- [ ] **Step 4: Create `packages/extension-firefox/manifest.json`** (note: literal JSON, not TS — Firefox doesn't have crxjs's defineManifest)

```json
{
  "manifest_version": 3,
  "name": "gitmarks",
  "version": "0.0.1",
  "description": "Save bookmarks to your own GitHub repo.",
  "permissions": ["storage", "activeTab", "bookmarks", "alarms"],
  "host_permissions": ["https://api.github.com/*"],
  "action": {
    "default_popup": "popup.html",
    "default_title": "gitmarks"
  },
  "options_ui": {
    "page": "options.html",
    "open_in_tab": true
  },
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "browser_specific_settings": {
    "gecko": {
      "id": "gitmarks@paperhurts.dev",
      "strict_min_version": "121.0"
    }
  }
}
```

(Note: `options_page` in Chrome's manifest is `options_ui` in Firefox MV3 — same semantic, different field name.)

- [ ] **Step 5: Create `packages/extension-firefox/scripts/copy-manifest.mjs`**

Plain Vite doesn't bundle the manifest. We copy it into `dist/` post-build:

```javascript
// packages/extension-firefox/scripts/copy-manifest.mjs
import { copyFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
mkdirSync(resolve(root, "dist"), { recursive: true });
copyFileSync(
  resolve(root, "manifest.json"),
  resolve(root, "dist/manifest.json"),
);
console.log("[firefox] copied manifest.json to dist/");
```

- [ ] **Step 6: Create shell entry files**

`packages/extension-firefox/src/background.ts`:
```typescript
import "@gitmarks/extension-shared/background";
```

`packages/extension-firefox/src/popup.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>gitmarks</title>
  </head>
  <body>
    <main id="root">loading…</main>
    <script type="module" src="./popup.ts"></script>
  </body>
</html>
```

`packages/extension-firefox/src/popup.ts`:
```typescript
import "@gitmarks/extension-shared/popup";
```

`packages/extension-firefox/src/options.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>gitmarks — settings</title>
  </head>
  <body>
    <main id="root">loading…</main>
    <script type="module" src="./options.ts"></script>
  </body>
</html>
```

`packages/extension-firefox/src/options.ts`:
```typescript
import "@gitmarks/extension-shared/options";
```

- [ ] **Step 7: Install + verify build**

```bash
pnpm install
pnpm --filter @gitmarks/extension-firefox typecheck
# Expect: exit 0
pnpm --filter @gitmarks/extension-firefox build
# Expect: vite builds + copy-manifest script runs.
# dist/ should contain: background.js, popup.html, options.html, manifest.json, assets/
ls packages/extension-firefox/dist/
# Expect: manifest.json + background.js + popup.html + options.html visible
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(extension-firefox): bootstrap Firefox MV3 add-on package

Plain Vite multi-entry build (crxjs is Chrome-only). Manifest is
literal JSON copied into dist/ post-build via scripts/copy-manifest.mjs.

Targets Firefox 121+ for MV3 service-worker parity. browser_specific_settings
declares the gecko id and strict_min_version.

Source files are minimal shells that re-export from @gitmarks/extension-shared
— all the actual code (popup, options, background, lib/) is shared with
extension-chrome via that workspace package.

Closes #23."
```

---

### Task 4: README + manual smoke test guide

**Files:**
- Create: `packages/extension-firefox/README.md`

- [ ] **Step 1: Write the README**

```markdown
# @gitmarks/extension-firefox

Firefox MV3 add-on. Save bookmarks to your own GitHub repo + two-way sync
with the native bookmark tree. Functionally identical to the Chrome
extension; both load the same source from `@gitmarks/extension-shared`.

## Develop

```bash
pnpm --filter @gitmarks/extension-firefox build
```

Then in Firefox 121+:

1. Go to `about:debugging` → "This Firefox".
2. Click "Load Temporary Add-on…"
3. Select `packages/extension-firefox/dist/manifest.json`.

The extension loads as temporary — it'll be removed when you quit
Firefox. For permanent installation you'd need to sign with AMO
(deferred per `spec.md`).

## First-run setup

Same as the Chrome extension — see
`packages/extension-chrome/README.md` "First-run setup". The popup,
options page, and behavior are identical.

## Manual smoke test

The unit test suite (`pnpm --filter @gitmarks/extension-shared test`)
covers all the shared logic that runs in both browsers. The Firefox-
specific bits (manifest, build output, runtime behavior in Firefox's
WebExtensions runtime) need a manual check:

- [ ] Build, load via `about:debugging`, confirm the toolbar icon
      appears and the popup opens.
- [ ] Walk through the Chrome README's "Manual smoke test" sections
      ("Popup + toolbar save" and "Native tree sync") in Firefox.
      Everything should behave the same.
- [ ] Check `about:debugging` → click "Inspect" on the gitmarks
      add-on. The DevTools console should show the service worker
      running with no errors. The 5-minute alarm should be visible
      under Storage → Extension Storage.

## Known limitations

Same as the Chrome extension's "Known limitations" section in
`packages/extension-chrome/README.md`. Notably:
- Folder-delete cascade not handled (documented limitation; issue #2).
- Cross-browser e2e isn't automated; Playwright's Firefox driver
  doesn't fully support WebExtensions APIs. The shared unit tests
  cover the algorithm; this manual smoke test covers the wiring.
```

(Note: replace `` ` `` ` (backtick-space-backtick) sequences in the prose above with real triple backticks.)

- [ ] **Step 2: Update the root README to mention the Firefox package**

In `README.md`'s "Packages" table, add a row:

```markdown
| `@gitmarks/extension-firefox` | Firefox MV3 add-on. Same functionality as Chrome via the shared package. Load via `about:debugging`. |
```

And in the roadmap, mark Firefox as done:

```markdown
- ✅ Firefox build (`webextension-polyfill`) ([#23](https://github.com/paperhurts/gitmarks/issues/23))
```

- [ ] **Step 3: Update CLAUDE.md package list**

Add a bullet under "Project status":
```markdown
- `@gitmarks/extension-firefox` (`packages/extension-firefox/`) — Firefox MV3 shell over the shared package. Loads via `about:debugging` → "Load Temporary Add-on".
```

And note that `@gitmarks/extension-shared` is the canonical owner of the cross-browser code now.

- [ ] **Step 4: Update `packages/extension-chrome/README.md` to reflect the refactor**

Change:
```markdown
Chrome MV3 extension. Save bookmarks to your own GitHub repo, and keep
Chrome's native bookmark tree in two-way sync with the JSON file.
```

To:
```markdown
Chrome MV3 extension shell. The bulk of the implementation lives in
`@gitmarks/extension-shared`; this package owns only the Chrome-specific
manifest, Vite + crxjs build configuration, and Playwright e2e tests.

Functionally identical to `@gitmarks/extension-firefox` — both shells
import the same source.
```

- [ ] **Step 5: Verify the full suite + commit**

```bash
pnpm test           # extension-shared 97/97 + core 65/65
pnpm typecheck      # all packages clean
pnpm build          # all packages emit dist/
pnpm --filter @gitmarks/extension-chrome e2e   # 4 passing, 2 skipped
```

```bash
git add -A
git commit -m "docs(extension-firefox): README + cross-reference updates

- packages/extension-firefox/README.md: load-via-about:debugging workflow,
  pointer to the shared smoke-test checklist, known-limitations refs.
- README.md, CLAUDE.md: add the firefox package to the packages list and
  mark Firefox build done in the roadmap.
- packages/extension-chrome/README.md: clarify it's now a thin shell."
```

---

## Self-review summary

**Spec coverage:**

| Spec section | Covered by |
|---|---|
| spec.md §"Build order" — Firefox via webextension-polyfill | Tasks 0-3 |
| Issue #23 scope — `extension-firefox` package consuming the same source | Tasks 0-3 |
| webextension-polyfill shim for Chrome-vs-Firefox API differences | Task 2 |
| Adapt popup/options pages | Implicit — they're vanilla HTML + browser.* already |
| Cross-browser test infra | Deferred to follow-up; unit tests in extension-shared cover the shared logic |
| Document dev workflow | Task 4 |

**Out of scope explicitly (do not implement here):**

- AMO signing / store distribution
- Playwright e2e for Firefox
- Firefox event-page fallback for pre-121
- Refactoring the manifest configuration into a shared schema (each browser's manifest is small enough that duplication is fine)

**Placeholder scan:** none.

**Type/name consistency:** `@gitmarks/extension-shared` is the package name used uniformly across imports, package.json `dependencies`, and the workspace declarations. The `browser` import is uniform. The `chrome` global still works in tests via dual stubbing.

**Verification:** by the end of Task 4, the repo has 3 workspace packages: `core` (unchanged, 65 tests), `extension-shared` (new, 97 tests + the chrome stub), `extension-chrome` (thin shell, 4 e2e passing + 2 skipped), `extension-firefox` (thin shell, builds cleanly). All typecheck + build pass. Firefox add-on manually verified via the README's smoke test (the agent executing this plan should run that smoke test if Firefox is available locally; otherwise note it as user-required).
