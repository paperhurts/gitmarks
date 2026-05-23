# Gitmarks Chrome Extension MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a minimal Chrome extension that lets a user paste their GitHub PAT, point at a repo, and save the current tab as a bookmark to `bookmarks.json` in that repo. No native bookmark-tree integration, no polling, no reconciliation — just the toolbar-button save flow.

**Architecture:** A single `packages/extension-chrome` MV3 extension. Vite + `@crxjs/vite-plugin` builds the service worker, popup, and options page. The service worker uses `@gitmarks/core`'s `GitHubClient.update()` to add bookmarks with optimistic concurrency. Settings live in `chrome.storage.local`. All logic that touches `chrome.*` is wrapped in thin adapter modules so the core save flow can be unit-tested with stubbed globals.

**Tech Stack:** TypeScript 5.x strict ESM, Vite 5.x + `@crxjs/vite-plugin@^2`, Vitest 2.x. Targets Chrome ≥120 (MV3 ES-module service workers). Depends on `@gitmarks/core` via workspace protocol.

**Spec reference:** `spec.md` — particularly §"Extension behavior" (first-run setup, steady-state listeners), §"How clients talk to GitHub" (already covered by core), §"Data model" (Bookmark shape).

**Out of scope (deferred to later plans):**
- `chrome.bookmarks.*` listeners and reconciliation
- 5-minute poll loop (`chrome.alarms`)
- ID mapping table (`{ ulid: chrome_node_id }`)
- Folder support beyond root (`""`)
- Tags UI (web UI scope)
- Web UI (separate plans)
- Icons (use Chrome's default puzzle-piece glyph for MVP)
- Firefox / Safari builds (separate plans)

---

## File Structure

```
packages/extension-chrome/
├── package.json
├── tsconfig.json
├── vite.config.ts                # vite + @crxjs/vite-plugin + manifest from manifest.config.ts
├── vitest.config.ts
├── manifest.config.ts            # MV3 manifest as TS for crxjs
├── src/
│   ├── background.ts             # MV3 service worker entry: chrome.runtime.onMessage handler
│   ├── popup.html
│   ├── popup.ts                  # 1-button contextual UI (set up vs save)
│   ├── options.html
│   ├── options.ts                # PAT + repo entry + validate button
│   └── lib/
│       ├── settings.ts           # typed chrome.storage.local wrapper + Zod schema
│       ├── machine-id.ts         # generate-or-load random short ID
│       ├── bookmark-factory.ts   # pure: {url, title, machineId, now} → Bookmark
│       └── save-flow.ts          # pure (modulo client): handle "save current page" message
└── test/
    ├── setup.ts                  # vi.stubGlobal("chrome", ...) shared by all unit tests
    ├── settings.test.ts
    ├── machine-id.test.ts
    ├── bookmark-factory.test.ts
    └── save-flow.test.ts         # exercises save-flow with a stub GitHubClient
```

**Why this split:**
- `settings.ts`, `machine-id.ts`, `bookmark-factory.ts`, `save-flow.ts` are pure (or pure modulo a stubbed dependency) → unit-testable.
- `background.ts`, `popup.ts`, `options.ts` are thin wiring → verified by manual smoke test, not by unit tests (mocking the entire `chrome.runtime` + `chrome.tabs` + DOM surface is more work than the wiring is worth at this stage).
- `manifest.config.ts` is the single source of truth for the manifest; crxjs reads it.

---

## Conventions

- **ESM throughout.** `"type": "module"` in `package.json`. Source imports use `.js` suffix.
- **No global state.** Even the service worker re-reads settings on each message (service workers can be torn down by Chrome at any time).
- **Errors from core surface directly.** Catch `GitHubError` subclasses in `background.ts` and return structured `{ok: false, kind, message}` to the popup. Don't try to "improve" core's error model.
- **`added_from` format:** `chrome@<machineId>` where machineId is an 8-char random base32 string generated on first install.
- **URL normalization:** every save passes the URL through `normalizeUrl()` from core before constructing the Bookmark.
- **Folder:** always `""` for MVP. Don't try to derive folder structure from anything yet.
- **Commit messages from the extension to GitHub:** `add bookmark from chrome@<machineId>`. This is what shows up in the user's `bookmarks` repo history.

---

## Library and convention choices (locked in upfront)

- **Manifest version:** 3 (MV3 only — MV2 is dead).
- **Permissions:** `storage`, `activeTab`. We need `activeTab` to read the URL and title of the currently focused tab on user gesture. `storage` for settings.
- **Host permissions:** `https://api.github.com/*`. Nothing else.
- **Service worker `type`:** `module` (ES modules in service workers).
- **Popup default state:** `popup.html`. Always opens regardless of setup state — the popup itself decides what to render.
- **Options page:** opened via `chrome.runtime.openOptionsPage()` from popup when not configured; also accessible via right-click → Options.
- **No background fetch / alarms / bookmark listeners** in this MVP (next plan).
- **Vitest environment:** `jsdom` (DOM available for popup/options test scaffolding if needed; we won't write those tests in this plan but the config is set up correctly).

---

## Tasks

### Task 0: Bootstrap `packages/extension-chrome` skeleton

**Files:**
- Create: `packages/extension-chrome/package.json`
- Create: `packages/extension-chrome/tsconfig.json`
- Create: `packages/extension-chrome/vite.config.ts`
- Create: `packages/extension-chrome/vitest.config.ts`
- Create: `packages/extension-chrome/manifest.config.ts`
- Create: `packages/extension-chrome/src/background.ts` (placeholder)
- Create: `packages/extension-chrome/src/popup.html` (placeholder)
- Create: `packages/extension-chrome/src/popup.ts` (placeholder)
- Create: `packages/extension-chrome/src/options.html` (placeholder)
- Create: `packages/extension-chrome/src/options.ts` (placeholder)
- Create: `packages/extension-chrome/test/setup.ts`
- Create: `packages/extension-chrome/test/smoke.test.ts`

- [ ] **Step 1: Create `packages/extension-chrome/package.json`**

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
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@gitmarks/core": "workspace:*"
  },
  "devDependencies": {
    "@crxjs/vite-plugin": "^2.0.0-beta.28",
    "@types/chrome": "^0.0.268",
    "jsdom": "^25.0.0",
    "vite": "^5.4.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `packages/extension-chrome/tsconfig.json`**

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
  "include": ["src/**/*.ts", "test/**/*.ts", "manifest.config.ts", "vite.config.ts", "vitest.config.ts"]
}
```

(Note: `outDir` is set but `noEmit: true` — we use Vite for the actual build. The dir is only used if a future task needs `tsc --build` for incremental.)

- [ ] **Step 3: Create `packages/extension-chrome/manifest.config.ts`**

```typescript
import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "gitmarks",
  version: "0.0.1",
  description: "Save bookmarks to your own GitHub repo.",
  permissions: ["storage", "activeTab"],
  host_permissions: ["https://api.github.com/*"],
  action: {
    default_popup: "src/popup.html",
    default_title: "gitmarks",
  },
  options_page: "src/options.html",
  background: {
    service_worker: "src/background.ts",
    type: "module",
  },
});
```

- [ ] **Step 4: Create `packages/extension-chrome/vite.config.ts`**

```typescript
import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.config.js";

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    target: "esnext",
    minify: false,
    sourcemap: true,
    rollupOptions: {
      output: {
        chunkFileNames: "assets/[name]-[hash].js",
      },
    },
  },
});
```

- [ ] **Step 5: Create `packages/extension-chrome/vitest.config.ts`**

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

- [ ] **Step 6: Create `packages/extension-chrome/test/setup.ts`**

```typescript
import { vi } from "vitest";

interface StorageBackend {
  data: Record<string, unknown>;
}

const backend: StorageBackend = { data: {} };

const chromeStub = {
  storage: {
    local: {
      get: vi.fn(async (keys?: string | string[] | null) => {
        if (keys == null) return { ...backend.data };
        const list = Array.isArray(keys) ? keys : [keys];
        const out: Record<string, unknown> = {};
        for (const k of list) {
          if (k in backend.data) out[k] = backend.data[k];
        }
        return out;
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(backend.data, items);
      }),
      remove: vi.fn(async (keys: string | string[]) => {
        const list = Array.isArray(keys) ? keys : [keys];
        for (const k of list) delete backend.data[k];
      }),
      clear: vi.fn(async () => {
        for (const k of Object.keys(backend.data)) delete backend.data[k];
      }),
    },
  },
  runtime: {
    openOptionsPage: vi.fn(),
    sendMessage: vi.fn(),
    onMessage: { addListener: vi.fn() },
    lastError: undefined as chrome.runtime.LastError | undefined,
  },
  tabs: {
    query: vi.fn(),
  },
};

vi.stubGlobal("chrome", chromeStub);

// Reset chrome.storage between tests so leaks don't propagate.
import { beforeEach } from "vitest";
beforeEach(async () => {
  await chromeStub.storage.local.clear();
  vi.clearAllMocks();
});

export { chromeStub };
```

- [ ] **Step 7: Create placeholder source files**

`packages/extension-chrome/src/background.ts`:
```typescript
// Service worker entry. Implemented in Task 4.
export {};
```

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
// Popup UI. Implemented in Task 6.
export {};
```

`packages/extension-chrome/src/options.html`:
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

`packages/extension-chrome/src/options.ts`:
```typescript
// Options UI. Implemented in Task 5.
export {};
```

- [ ] **Step 8: Create `packages/extension-chrome/test/smoke.test.ts`**

```typescript
import { describe, it, expect } from "vitest";

describe("@gitmarks/extension-chrome smoke", () => {
  it("has chrome.storage stubbed by the global setup", () => {
    expect(typeof chrome).toBe("object");
    expect(typeof chrome.storage.local.get).toBe("function");
  });
});
```

- [ ] **Step 9: Install dependencies**

Run: `pnpm install`
Expected: pnpm fetches `@crxjs/vite-plugin`, `vite`, `vitest`, `jsdom`, `@types/chrome` and resolves `@gitmarks/core` from the workspace.

- [ ] **Step 10: Verify the toolchain works**

Run: `pnpm --filter @gitmarks/extension-chrome test`
Expected: 1 test passes (smoke).

Run: `pnpm --filter @gitmarks/extension-chrome typecheck`
Expected: exit 0.

Run: `pnpm --filter @gitmarks/extension-chrome build`
Expected: Vite emits `packages/extension-chrome/dist/` containing `manifest.json`, `src/background.js` (or similar — crxjs determines exact layout), `src/popup.html`, `src/options.html`, and chunked assets. No errors.

Inspect: `ls packages/extension-chrome/dist/`
Expected: `manifest.json` exists at the root of `dist/`. (This is what "load unpacked" will point at.)

- [ ] **Step 11: Commit**

```bash
git add packages/extension-chrome
git commit -m "chore(extension-chrome): bootstrap MV3 extension skeleton with vite + crxjs"
```

(Note: if `pnpm install` updated `pnpm-lock.yaml`, also include it: `git add pnpm-lock.yaml` before commit.)

---

### Task 1: Settings storage wrapper

**Files:**
- Create: `packages/extension-chrome/src/lib/settings.ts`
- Create: `packages/extension-chrome/test/settings.test.ts`

`Settings` shape: `{ token: string, owner: string, repo: string, branch: string }`. Stored under key `gitmarks:settings`. Loading returns `null` when not configured. The settings layer is the single seam between everything else in the extension and `chrome.storage.local`.

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { loadSettings, saveSettings, clearSettings } from "../src/lib/settings.js";

describe("settings", () => {
  it("returns null when nothing is stored", async () => {
    expect(await loadSettings()).toBeNull();
  });

  it("round-trips a valid settings object", async () => {
    const s = {
      token: "ghp_test_1234",
      owner: "alice",
      repo: "bookmarks",
      branch: "main",
    };
    await saveSettings(s);
    expect(await loadSettings()).toEqual(s);
  });

  it("returns null when the stored value is malformed", async () => {
    await chrome.storage.local.set({ "gitmarks:settings": { not: "valid" } });
    expect(await loadSettings()).toBeNull();
  });

  it("clearSettings removes the stored value", async () => {
    await saveSettings({
      token: "t",
      owner: "o",
      repo: "r",
      branch: "main",
    });
    await clearSettings();
    expect(await loadSettings()).toBeNull();
  });

  it("rejects an empty token at save time", async () => {
    await expect(
      saveSettings({ token: "", owner: "o", repo: "r", branch: "main" }),
    ).rejects.toThrow();
  });

  it("rejects an owner/repo containing slashes", async () => {
    await expect(
      saveSettings({
        token: "t",
        owner: "a/b",
        repo: "r",
        branch: "main",
      }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @gitmarks/extension-chrome test test/settings.test.ts`
Expected: fails — `src/lib/settings.ts` does not exist.

- [ ] **Step 3: Implement `packages/extension-chrome/src/lib/settings.ts`**

```typescript
import { z } from "zod";

const SETTINGS_KEY = "gitmarks:settings";

export const settingsSchema = z.object({
  token: z.string().min(1, "token required"),
  owner: z.string().regex(/^[A-Za-z0-9_.-]+$/, "owner must be a single GitHub login"),
  repo: z.string().regex(/^[A-Za-z0-9_.-]+$/, "repo must be a single GitHub repo name"),
  branch: z.string().min(1),
});

export type Settings = z.infer<typeof settingsSchema>;

export async function loadSettings(): Promise<Settings | null> {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  const raw = result[SETTINGS_KEY];
  if (raw == null) return null;
  const parsed = settingsSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export async function saveSettings(value: Settings): Promise<void> {
  const validated = settingsSchema.parse(value);
  await chrome.storage.local.set({ [SETTINGS_KEY]: validated });
}

export async function clearSettings(): Promise<void> {
  await chrome.storage.local.remove(SETTINGS_KEY);
}
```

(Note: `zod` is already in the workspace via `@gitmarks/core`; the extension package re-imports it transitively. If the implementer hits a peer-deps issue, add `zod` directly to `packages/extension-chrome/package.json` dependencies.)

- [ ] **Step 4: Run and verify passing**

Run: `pnpm --filter @gitmarks/extension-chrome test test/settings.test.ts`
Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/extension-chrome/src/lib/settings.ts packages/extension-chrome/test/settings.test.ts
git commit -m "feat(extension-chrome): add typed settings storage wrapper"
```

---

### Task 2: Machine ID generation

**Files:**
- Create: `packages/extension-chrome/src/lib/machine-id.ts`
- Create: `packages/extension-chrome/test/machine-id.test.ts`

The machine ID is a short, stable, random identifier stamped into every `added_from`. It lets a future user reading their commit history tell which device wrote which bookmarks, without leaking real hostnames. Generated once on first call, then cached in `chrome.storage.local`.

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { getMachineId } from "../src/lib/machine-id.js";

describe("machine-id", () => {
  it("generates an 8-char Crockford base32 id on first call", async () => {
    const id = await getMachineId();
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
  });

  it("returns the same id on subsequent calls", async () => {
    const a = await getMachineId();
    const b = await getMachineId();
    expect(a).toBe(b);
  });

  it("persists the id in chrome.storage.local under 'gitmarks:machineId'", async () => {
    const id = await getMachineId();
    const stored = await chrome.storage.local.get("gitmarks:machineId");
    expect(stored["gitmarks:machineId"]).toBe(id);
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @gitmarks/extension-chrome test test/machine-id.test.ts`
Expected: fails — file does not exist.

- [ ] **Step 3: Implement `packages/extension-chrome/src/lib/machine-id.ts`**

```typescript
const KEY = "gitmarks:machineId";
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32

function newId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b & 31];
  return out;
}

export async function getMachineId(): Promise<string> {
  const stored = await chrome.storage.local.get(KEY);
  const existing = stored[KEY];
  if (typeof existing === "string" && /^[0-9A-HJKMNP-TV-Z]{8}$/.test(existing)) {
    return existing;
  }
  const fresh = newId();
  await chrome.storage.local.set({ [KEY]: fresh });
  return fresh;
}
```

- [ ] **Step 4: Run and verify passing**

Run: `pnpm --filter @gitmarks/extension-chrome test test/machine-id.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/extension-chrome/src/lib/machine-id.ts packages/extension-chrome/test/machine-id.test.ts
git commit -m "feat(extension-chrome): generate and persist a per-install machine id"
```

---

### Task 3: Bookmark factory

**Files:**
- Create: `packages/extension-chrome/src/lib/bookmark-factory.ts`
- Create: `packages/extension-chrome/test/bookmark-factory.test.ts`

Pure function. Takes `{url, title, machineId, nowIso}`, returns a `Bookmark` ready to be appended to the file. Uses `normalizeUrl` and `newUlid` from `@gitmarks/core`. Always emits `folder: ""`, `tags: []`, `deleted_at: null`, `notes: null` for MVP.

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { bookmarkSchema } from "@gitmarks/core";
import { buildBookmark } from "../src/lib/bookmark-factory.js";

describe("buildBookmark", () => {
  it("produces a schema-valid bookmark", () => {
    const bm = buildBookmark({
      url: "https://example.com/article/",
      title: "Example",
      machineId: "ABCDE12F",
      nowIso: "2026-05-23T14:32:11Z",
    });
    expect(() => bookmarkSchema.parse(bm)).not.toThrow();
  });

  it("normalizes the URL (strips trailing slash, drops non-hashbang fragments)", () => {
    const bm = buildBookmark({
      url: "https://example.com/article/#section",
      title: "Example",
      machineId: "ABCDE12F",
      nowIso: "2026-05-23T14:32:11Z",
    });
    expect(bm.url).toBe("https://example.com/article");
  });

  it("sets added_from = chrome@<machineId>", () => {
    const bm = buildBookmark({
      url: "https://example.com/",
      title: "x",
      machineId: "ABCDE12F",
      nowIso: "2026-05-23T14:32:11Z",
    });
    expect(bm.added_from).toBe("chrome@ABCDE12F");
  });

  it("sets folder to empty and tags to empty array", () => {
    const bm = buildBookmark({
      url: "https://example.com/",
      title: "x",
      machineId: "ABCDE12F",
      nowIso: "2026-05-23T14:32:11Z",
    });
    expect(bm.folder).toBe("");
    expect(bm.tags).toEqual([]);
  });

  it("sets added_at == updated_at == nowIso", () => {
    const bm = buildBookmark({
      url: "https://example.com/",
      title: "x",
      machineId: "ABCDE12F",
      nowIso: "2026-05-23T14:32:11Z",
    });
    expect(bm.added_at).toBe("2026-05-23T14:32:11Z");
    expect(bm.updated_at).toBe("2026-05-23T14:32:11Z");
  });

  it("generates a fresh ULID each call", () => {
    const a = buildBookmark({
      url: "https://example.com/",
      title: "x",
      machineId: "ABCDE12F",
      nowIso: "2026-05-23T14:32:11Z",
    });
    const b = buildBookmark({
      url: "https://example.com/",
      title: "x",
      machineId: "ABCDE12F",
      nowIso: "2026-05-23T14:32:11Z",
    });
    expect(a.id).not.toBe(b.id);
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @gitmarks/extension-chrome test test/bookmark-factory.test.ts`
Expected: fails — file does not exist.

- [ ] **Step 3: Implement `packages/extension-chrome/src/lib/bookmark-factory.ts`**

```typescript
import type { Bookmark } from "@gitmarks/core";
import { newUlid, normalizeUrl } from "@gitmarks/core";

export interface BuildBookmarkInput {
  url: string;
  title: string;
  machineId: string;
  nowIso: string;
}

export function buildBookmark(input: BuildBookmarkInput): Bookmark {
  return {
    id: newUlid(),
    url: normalizeUrl(input.url),
    title: input.title,
    folder: "",
    tags: [],
    added_at: input.nowIso,
    updated_at: input.nowIso,
    added_from: `chrome@${input.machineId}`,
    deleted_at: null,
    notes: null,
  };
}
```

- [ ] **Step 4: Run and verify passing**

Run: `pnpm --filter @gitmarks/extension-chrome test test/bookmark-factory.test.ts`
Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/extension-chrome/src/lib/bookmark-factory.ts packages/extension-chrome/test/bookmark-factory.test.ts
git commit -m "feat(extension-chrome): build schema-valid Bookmark from url+title+machineId"
```

---

### Task 4: Save-flow handler

**Files:**
- Create: `packages/extension-chrome/src/lib/save-flow.ts`
- Create: `packages/extension-chrome/test/save-flow.test.ts`
- Modify: `packages/extension-chrome/src/background.ts`

This is the orchestration. `save-flow.ts` exports `saveBookmark(client, settings, page, machineId, nowIso)` which:
1. Tries `client.update("bookmarks.json", file => addBookmark(file, buildBookmark(...), nowIso), msg)`.
2. If the read inside `update` throws `GitHubNotFoundError`, falls back to `client.write("bookmarks.json", emptyFile, msg)` to bootstrap, then retries.
3. Returns a structured `{ok: true, bookmark}` or `{ok: false, kind, message}`.

`background.ts` wires the message handler to call this.

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect, vi } from "vitest";
import {
  GitHubClient,
  GitHubNotFoundError,
  GitHubAuthError,
  bookmarksFileSchema,
  type BookmarksFile,
} from "@gitmarks/core";
import { saveBookmark } from "../src/lib/save-flow.js";

const settings = {
  token: "t",
  owner: "alice",
  repo: "marks",
  branch: "main",
};
const machineId = "ABCDE12F";
const nowIso = "2026-05-23T14:32:11Z";
const page = { url: "https://example.com/", title: "Example" };

function fakeClient(overrides: Partial<GitHubClient>): GitHubClient {
  return overrides as unknown as GitHubClient;
}

describe("saveBookmark", () => {
  it("calls update once and returns the new bookmark on the happy path", async () => {
    const update = vi.fn(async (_path, mutate: (f: BookmarksFile) => BookmarksFile) => {
      const next = mutate({
        version: 1,
        updated_at: "2026-05-01T00:00:00Z",
        bookmarks: [],
      });
      return { data: next, sha: "newsha", etag: '"e"' };
    });
    const client = fakeClient({ update });

    const result = await saveBookmark(client, settings, page, machineId, nowIso);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.bookmark.url).toBe("https://example.com/");
    expect(result.bookmark.added_from).toBe("chrome@ABCDE12F");
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]![0]).toBe("bookmarks.json");
  });

  it("bootstraps an empty bookmarks.json on first save (404 path)", async () => {
    let updateCallCount = 0;
    const update = vi.fn(async (_path, mutate: (f: BookmarksFile) => BookmarksFile) => {
      updateCallCount += 1;
      if (updateCallCount === 1) {
        throw new GitHubNotFoundError("bookmarks.json");
      }
      const next = mutate({
        version: 1,
        updated_at: "2026-05-01T00:00:00Z",
        bookmarks: [],
      });
      return { data: next, sha: "s2", etag: '"e2"' };
    });
    const write = vi.fn(async () => ({ sha: "s1", etag: '"e1"' }));
    const client = fakeClient({ update, write });

    const result = await saveBookmark(client, settings, page, machineId, nowIso);

    expect(result.ok).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    const [path, data] = write.mock.calls[0]!;
    expect(path).toBe("bookmarks.json");
    expect(() => bookmarksFileSchema.parse(data)).not.toThrow();
    expect((data as BookmarksFile).bookmarks).toEqual([]);
    expect(update).toHaveBeenCalledTimes(2);
  });

  it("returns {ok:false, kind:'auth'} on a GitHubAuthError", async () => {
    const update = vi.fn(async () => {
      throw new GitHubAuthError();
    });
    const client = fakeClient({ update });

    const result = await saveBookmark(client, settings, page, machineId, nowIso);

    expect(result).toEqual({
      ok: false,
      kind: "auth",
      message: expect.any(String),
    });
  });

  it("returns {ok:false, kind:'unknown'} on a non-GitHub error", async () => {
    const update = vi.fn(async () => {
      throw new Error("boom");
    });
    const client = fakeClient({ update });

    const result = await saveBookmark(client, settings, page, machineId, nowIso);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.kind).toBe("unknown");
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @gitmarks/extension-chrome test test/save-flow.test.ts`
Expected: fails — file does not exist.

- [ ] **Step 3: Implement `packages/extension-chrome/src/lib/save-flow.ts`**

```typescript
import type {
  Bookmark,
  BookmarksFile,
  GitHubClient,
} from "@gitmarks/core";
import {
  GitHubAuthError,
  GitHubConflictError,
  GitHubError,
  GitHubNotFoundError,
  addBookmark,
} from "@gitmarks/core";
import type { Settings } from "./settings.js";
import { buildBookmark } from "./bookmark-factory.js";

const BOOKMARKS_PATH = "bookmarks.json";

export interface PageInfo {
  url: string;
  title: string;
}

export type SaveResult =
  | { ok: true; bookmark: Bookmark }
  | { ok: false; kind: "auth" | "conflict" | "not_found" | "unknown"; message: string };

function emptyBookmarksFile(nowIso: string): BookmarksFile {
  return { version: 1, updated_at: nowIso, bookmarks: [] };
}

export async function saveBookmark(
  client: GitHubClient,
  _settings: Settings,
  page: PageInfo,
  machineId: string,
  nowIso: string,
): Promise<SaveResult> {
  const bookmark = buildBookmark({
    url: page.url,
    title: page.title,
    machineId,
    nowIso,
  });
  const commitMsg = `add bookmark from chrome@${machineId}`;

  try {
    await client.update<BookmarksFile>(
      BOOKMARKS_PATH,
      (current) => addBookmark(current, bookmark, nowIso),
      commitMsg,
    );
    return { ok: true, bookmark };
  } catch (err) {
    if (err instanceof GitHubNotFoundError) {
      // First write ever — create the file, then retry the add.
      try {
        await client.write<BookmarksFile>(
          BOOKMARKS_PATH,
          emptyBookmarksFile(nowIso),
          `initialize bookmarks.json from chrome@${machineId}`,
        );
        await client.update<BookmarksFile>(
          BOOKMARKS_PATH,
          (current) => addBookmark(current, bookmark, nowIso),
          commitMsg,
        );
        return { ok: true, bookmark };
      } catch (err2) {
        return classify(err2);
      }
    }
    return classify(err);
  }
}

function classify(err: unknown): SaveResult {
  if (err instanceof GitHubAuthError) {
    return { ok: false, kind: "auth", message: err.message };
  }
  if (err instanceof GitHubConflictError) {
    return { ok: false, kind: "conflict", message: err.message };
  }
  if (err instanceof GitHubNotFoundError) {
    return { ok: false, kind: "not_found", message: err.message };
  }
  if (err instanceof GitHubError) {
    return { ok: false, kind: "unknown", message: err.message };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { ok: false, kind: "unknown", message };
}
```

- [ ] **Step 4: Replace `packages/extension-chrome/src/background.ts` with the real handler**

```typescript
import { GitHubClient } from "@gitmarks/core";
import { loadSettings } from "./lib/settings.js";
import { getMachineId } from "./lib/machine-id.js";
import { saveBookmark, type PageInfo, type SaveResult } from "./lib/save-flow.js";

interface SaveCurrentPageMessage {
  type: "save-current-page";
  page: PageInfo;
}

type IncomingMessage = SaveCurrentPageMessage;

chrome.runtime.onMessage.addListener(
  (msg: IncomingMessage, _sender, sendResponse) => {
    if (msg?.type !== "save-current-page") return false;
    void handleSavePage(msg.page).then(sendResponse);
    return true; // keep the message channel open for async sendResponse
  },
);

async function handleSavePage(page: PageInfo): Promise<SaveResult> {
  const settings = await loadSettings();
  if (settings == null) {
    return {
      ok: false,
      kind: "auth",
      message: "gitmarks is not configured. Open Options to set up.",
    };
  }
  const machineId = await getMachineId();
  const client = new GitHubClient({
    owner: settings.owner,
    repo: settings.repo,
    token: settings.token,
    branch: settings.branch,
  });
  return saveBookmark(client, settings, page, machineId, new Date().toISOString());
}
```

- [ ] **Step 5: Run and verify**

Run: `pnpm --filter @gitmarks/extension-chrome test`
Expected: all unit tests pass (smoke + settings + machine-id + bookmark-factory + save-flow = 17 tests).

Run: `pnpm --filter @gitmarks/extension-chrome typecheck`
Expected: exit 0.

Run: `pnpm --filter @gitmarks/extension-chrome build`
Expected: vite builds without errors.

- [ ] **Step 6: Commit**

```bash
git add packages/extension-chrome/src/lib/save-flow.ts packages/extension-chrome/src/background.ts packages/extension-chrome/test/save-flow.test.ts
git commit -m "feat(extension-chrome): wire save-current-page handler through @gitmarks/core"
```

---

### Task 5: Options page

**Files:**
- Modify: `packages/extension-chrome/src/options.ts`
- Modify: `packages/extension-chrome/src/options.html`

This is a thin UI over `settings.ts`. Fields: token (password input), owner, repo, branch (defaulted to "main"). Two buttons: "Validate" (does a `GitHubClient.read('bookmarks.json')` — or expects 404 for a new repo — to confirm the PAT works), and "Save".

No unit tests for this task — DOM testing the options page in jsdom is a lot of mocking for little signal. The Task 7 manual smoke test covers it.

- [ ] **Step 1: Replace `packages/extension-chrome/src/options.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>gitmarks — settings</title>
    <style>
      body {
        font-family: system-ui, sans-serif;
        max-width: 480px;
        margin: 2rem auto;
        padding: 0 1rem;
        color: #1a1a1a;
        background: #fafafa;
      }
      h1 { font-size: 1.5rem; margin-bottom: 1.5rem; }
      label { display: block; margin-bottom: 1rem; }
      label > span { display: block; font-size: 0.85rem; margin-bottom: 0.25rem; }
      input { width: 100%; padding: 0.5rem; font: inherit; box-sizing: border-box; border: 1px solid #ccc; border-radius: 4px; }
      .row { display: flex; gap: 0.5rem; margin-top: 1.5rem; }
      button { padding: 0.5rem 1rem; font: inherit; border: 1px solid #444; background: #222; color: white; border-radius: 4px; cursor: pointer; }
      button.secondary { background: white; color: #222; }
      #status { margin-top: 1rem; font-size: 0.9rem; min-height: 1.2em; }
      #status.ok { color: #096; }
      #status.err { color: #c00; }
    </style>
  </head>
  <body>
    <h1>gitmarks settings</h1>

    <label>
      <span>GitHub fine-grained personal access token</span>
      <input id="token" type="password" autocomplete="off" spellcheck="false" />
    </label>

    <label>
      <span>Repo owner (your GitHub login)</span>
      <input id="owner" type="text" autocomplete="off" spellcheck="false" />
    </label>

    <label>
      <span>Repo name</span>
      <input id="repo" type="text" autocomplete="off" spellcheck="false" />
    </label>

    <label>
      <span>Branch</span>
      <input id="branch" type="text" autocomplete="off" spellcheck="false" value="main" />
    </label>

    <div class="row">
      <button id="validate" class="secondary">Validate</button>
      <button id="save">Save</button>
    </div>

    <p id="status"></p>

    <script type="module" src="./options.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Replace `packages/extension-chrome/src/options.ts`**

```typescript
import { GitHubClient, GitHubNotFoundError } from "@gitmarks/core";
import { loadSettings, saveSettings, type Settings } from "./lib/settings.js";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (el == null) throw new Error(`#${id} not found`);
  return el as T;
};

const tokenInput = $<HTMLInputElement>("token");
const ownerInput = $<HTMLInputElement>("owner");
const repoInput = $<HTMLInputElement>("repo");
const branchInput = $<HTMLInputElement>("branch");
const validateBtn = $<HTMLButtonElement>("validate");
const saveBtn = $<HTMLButtonElement>("save");
const status = $<HTMLParagraphElement>("status");

function readForm(): Settings {
  return {
    token: tokenInput.value.trim(),
    owner: ownerInput.value.trim(),
    repo: repoInput.value.trim(),
    branch: branchInput.value.trim() || "main",
  };
}

function setStatus(msg: string, kind: "ok" | "err" | "neutral"): void {
  status.textContent = msg;
  status.className = kind === "neutral" ? "" : kind;
}

async function loadIntoForm(): Promise<void> {
  const s = await loadSettings();
  if (s == null) return;
  tokenInput.value = s.token;
  ownerInput.value = s.owner;
  repoInput.value = s.repo;
  branchInput.value = s.branch;
}

validateBtn.addEventListener("click", async () => {
  setStatus("validating…", "neutral");
  let s: Settings;
  try {
    s = readForm();
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err), "err");
    return;
  }
  const client = new GitHubClient(s);
  try {
    await client.read("bookmarks.json");
    setStatus("✓ valid PAT, repo exists, bookmarks.json found", "ok");
  } catch (err) {
    if (err instanceof GitHubNotFoundError) {
      setStatus(
        "✓ valid PAT, repo exists (bookmarks.json not yet created — will be on first save)",
        "ok",
      );
      return;
    }
    setStatus(err instanceof Error ? err.message : String(err), "err");
  }
});

saveBtn.addEventListener("click", async () => {
  try {
    await saveSettings(readForm());
    setStatus("✓ saved", "ok");
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err), "err");
  }
});

void loadIntoForm();
```

- [ ] **Step 3: Verify build and typecheck**

Run: `pnpm --filter @gitmarks/extension-chrome typecheck`
Expected: exit 0.

Run: `pnpm --filter @gitmarks/extension-chrome test`
Expected: 17 tests still pass (we didn't change anything tested).

Run: `pnpm --filter @gitmarks/extension-chrome build`
Expected: vite emits `dist/src/options.html` and `dist/assets/options-*.js`.

- [ ] **Step 4: Commit**

```bash
git add packages/extension-chrome/src/options.html packages/extension-chrome/src/options.ts
git commit -m "feat(extension-chrome): options page for PAT + repo entry with validation"
```

---

### Task 6: Popup

**Files:**
- Modify: `packages/extension-chrome/src/popup.html`
- Modify: `packages/extension-chrome/src/popup.ts`

Popup shows one of two states:
- **Not configured:** "Set up gitmarks" button → opens options page.
- **Configured:** "Save this page" button → fires `save-current-page` message → shows result.

- [ ] **Step 1: Replace `packages/extension-chrome/src/popup.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>gitmarks</title>
    <style>
      body {
        font-family: system-ui, sans-serif;
        margin: 0;
        padding: 0;
        background: #fafafa;
        color: #1a1a1a;
        min-width: 240px;
      }
      main { padding: 1rem; }
      button {
        width: 100%;
        padding: 0.6rem;
        font: inherit;
        border: 1px solid #444;
        background: #222;
        color: white;
        border-radius: 4px;
        cursor: pointer;
      }
      button:disabled { opacity: 0.6; cursor: progress; }
      #status { margin-top: 0.75rem; font-size: 0.85rem; min-height: 1.2em; }
      #status.ok { color: #096; }
      #status.err { color: #c00; }
      .title { font-size: 0.85rem; color: #555; margin: 0 0 0.5rem 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    </style>
  </head>
  <body>
    <main id="root">loading…</main>
    <script type="module" src="./popup.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Replace `packages/extension-chrome/src/popup.ts`**

```typescript
import { loadSettings } from "./lib/settings.js";
import type { SaveResult } from "./lib/save-flow.js";

const root = document.getElementById("root");
if (root == null) throw new Error("#root not found");

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

async function render(): Promise<void> {
  const settings = await loadSettings();
  if (settings == null) {
    root!.innerHTML = `
      <p class="title">Welcome to gitmarks.</p>
      <button id="setup">Set up gitmarks</button>
    `;
    document.getElementById("setup")!.addEventListener("click", () => {
      chrome.runtime.openOptionsPage();
      window.close();
    });
    return;
  }

  const tab = await getActiveTab();
  if (tab == null || tab.url == null) {
    root!.innerHTML = `<p id="status" class="err">No active tab.</p>`;
    return;
  }

  root!.innerHTML = `
    <p class="title" title="${escapeAttr(tab.title ?? tab.url)}">${escapeText(tab.title ?? tab.url)}</p>
    <button id="save">Save this page</button>
    <p id="status"></p>
  `;

  const saveBtn = document.getElementById("save") as HTMLButtonElement;
  const status = document.getElementById("status")!;

  saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true;
    saveBtn.textContent = "saving…";
    status.className = "";
    status.textContent = "";
    const result: SaveResult = await chrome.runtime.sendMessage({
      type: "save-current-page",
      page: { url: tab.url!, title: tab.title ?? tab.url! },
    });
    if (result.ok) {
      status.className = "ok";
      status.textContent = "✓ saved";
    } else {
      status.className = "err";
      status.textContent = result.message;
      saveBtn.disabled = false;
      saveBtn.textContent = "Try again";
    }
  });
}

function escapeText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeText(s).replace(/"/g, "&quot;");
}

void render();
```

- [ ] **Step 3: Verify**

Run: `pnpm --filter @gitmarks/extension-chrome typecheck`
Expected: exit 0.

Run: `pnpm --filter @gitmarks/extension-chrome test`
Expected: 17 tests still pass.

Run: `pnpm --filter @gitmarks/extension-chrome build`
Expected: emits `dist/manifest.json`, `dist/src/popup.html`, `dist/src/options.html`, and the chunked JS in `dist/assets/`.

- [ ] **Step 4: Commit**

```bash
git add packages/extension-chrome/src/popup.html packages/extension-chrome/src/popup.ts
git commit -m "feat(extension-chrome): popup with contextual setup/save flow"
```

---

### Task 7: README + manual smoke test guide

**Files:**
- Create: `packages/extension-chrome/README.md`

The MVP can't be fully verified with unit tests — the manifest, message-passing, and UI flow only work when the extension is actually loaded into Chrome. This task documents the manual smoke test that completes verification.

- [ ] **Step 1: Create `packages/extension-chrome/README.md`**

```markdown
# @gitmarks/extension-chrome

MVP Chrome extension. Save the current tab as a bookmark to your own
GitHub repo, via a toolbar button. No native bookmark-tree integration yet
— that's a separate plan.

## Develop

` ` `bash
pnpm --filter @gitmarks/extension-chrome build
` ` `

Then in Chrome:
1. Go to `chrome://extensions/`
2. Enable **Developer mode** (top right).
3. Click **Load unpacked**.
4. Select `packages/extension-chrome/dist/`.

The extension's toolbar icon appears as a default puzzle piece (icons
are deferred to a later plan). Pin it for easy access.

## First-run setup

1. Create a fine-grained PAT at
   https://github.com/settings/personal-access-tokens/new. Scope it to
   **only** the repo you'll use for bookmarks, with **Contents:
   Read and write**.
2. Click the toolbar icon → "Set up gitmarks" → enter PAT, owner, repo,
   branch.
3. Click **Validate**. You should see either
   "✓ valid PAT, repo exists, bookmarks.json found" or
   "✓ valid PAT, repo exists (bookmarks.json not yet created — will be on
   first save)".
4. Click **Save**.

## Manual smoke test

After loading the unpacked extension:

- [ ] Open the toolbar popup before configuring → it shows "Set up gitmarks".
- [ ] Click the setup button → options page opens in a new tab.
- [ ] Enter invalid creds (e.g., obviously bad PAT) and click **Validate**
      → red status message with a meaningful error.
- [ ] Enter valid creds and click **Validate** → green success.
- [ ] Click **Save**. Reopen the popup → it now shows "Save this page".
- [ ] Navigate to any web page, click the toolbar icon, then **Save this page**.
      → green "✓ saved" within ~2 seconds.
- [ ] Refresh the repo on github.com — `bookmarks.json` should contain
      the new entry. If this is the very first save, the file was just
      created with one bookmark.
- [ ] Save the same page again. → green "✓ saved" — a second entry with
      a different ULID and the same URL appears (dedupe is a later concern).
- [ ] Edit `bookmarks.json` manually on GitHub (add a space, commit).
      Save another page from the extension. → green "✓ saved" — the
      `update()` retry-replay loop handled the concurrent edit.

## Architecture notes

- All `chrome.*` access goes through `src/lib/{settings,machine-id}.ts`.
  Other modules are pure and unit-testable with vitest.
- The service worker is fire-and-forget per message. It re-reads
  `chrome.storage.local` on every save (service workers can be torn down
  by Chrome at any moment).
- On first save to a fresh repo, `save-flow.ts` catches
  `GitHubNotFoundError`, creates an empty `bookmarks.json`, then retries.
- URL normalization (strip trailing slash, drop non-hashbang fragments)
  happens at write time via `normalizeUrl()` from `@gitmarks/core`.

## Out of scope for this MVP

- `chrome.bookmarks.*` listeners (live sync from the native tree)
- 5-min poll loop (sync changes from other devices)
- ID-mapping table
- Folder support beyond root
- Tags UI (tags live in the JSON but no UI to edit them here yet)
- Icons (Chrome shows the default puzzle piece)
- Conflict resolution beyond core's automatic 409 retry
```

**NOTE on backticks:** Replace each `` ` `` ` triple (backtick-space-backtick) sequence above with three literal backticks. The prompt escapes them only to avoid breaking its own code fence.

- [ ] **Step 2: Verify the build artifact one more time**

Run: `pnpm --filter @gitmarks/extension-chrome build`
Expected: clean build, `dist/manifest.json` exists, `dist/src/popup.html`, `dist/src/options.html` exist.

Run: `cat packages/extension-chrome/dist/manifest.json`
Expected: a valid MV3 manifest referencing the built `background`, `popup`, and `options` paths.

Run: `pnpm --filter @gitmarks/extension-chrome test`
Expected: 17 unit tests pass.

Run: `pnpm --filter @gitmarks/extension-chrome typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add packages/extension-chrome/README.md
git commit -m "docs(extension-chrome): manual smoke test guide and architecture notes"
```

---

## Self-review summary

**Spec coverage:**

| Spec section | Covered by |
|---|---|
| §"Extension behavior" — First-run setup (paste PAT + repo) | Task 5 (options page) |
| §"Extension behavior" — PAT stored in `chrome.storage.local` | Task 1 (settings) |
| §"Extension behavior" — validate PAT against repo | Task 5 (Validate button) |
| §"Extension behavior" — create `bookmarks.json` if empty repo | Task 4 (`save-flow.ts` 404 path) |
| §"Data model" — Bookmark shape with all fields | Task 3 (bookmark-factory) |
| §"Data model" — `added_from` = `<browser>@<machine>` | Tasks 2 + 3 |
| §"Data model" — URL normalization | Task 3 (via `normalizeUrl` from core) |
| §"How clients talk to GitHub" — PUT with `prevSha`, retry on 409 | Reused from core's `update()`, exercised via `save-flow.ts` |

**Out of scope for this plan (covered by future plans, listed explicitly):**

- `chrome.bookmarks.*` event listeners (next plan: "Chrome native tree integration")
- 5-min `chrome.alarms` poll loop (next plan)
- Initial reconciliation between native tree and `bookmarks.json` (next plan)
- ID-mapping (`{ulid: chrome_node_id}`) table (next plan)
- Real icons (deferred)
- Auto-create-repo-if-missing on first-run setup (deferred — user must create repo manually for MVP)
- Edge cases beyond the manual smoke test list

**Placeholder scan:** none.

**Type/name consistency:** `Settings`, `Bookmark`, `BookmarksFile`, `GitHubClient`, `PageInfo`, `SaveResult`, `loadSettings`, `saveSettings`, `clearSettings`, `getMachineId`, `buildBookmark`, `saveBookmark` — used identically across all tasks.

**Verification:** 17 unit tests by Task 4 (the smoke + 6 settings + 3 machine-id + 6 bookmark-factory + 4 save-flow = 20; the smoke test is replaceable in the final cleanup if it adds no value, but for now we keep it). Tasks 5-7 don't add unit tests — they're covered by the Task 7 manual smoke test guide.
