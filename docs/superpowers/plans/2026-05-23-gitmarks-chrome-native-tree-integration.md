# Gitmarks Chrome Native Tree Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `@gitmarks/extension-chrome` keep Chrome's native bookmark tree and the user's `bookmarks.json` in continuous two-way sync. Add `chrome.bookmarks.*` listeners (push to GitHub on every local edit), an initial reconciliation algorithm (merge local tree and remote file on install / cold start), and a 5-minute `chrome.alarms` poll loop (pull remote changes from other devices). Add Playwright-driven browser e2e tests as the verification layer for everything `chrome.*`-related.

**Architecture:** Pure helpers (folder path conversion, ID mapping, suppression registry) live in `src/lib/`; orchestration in `src/background.ts`. The service worker registers listeners at module top-level and a `chrome.alarms` periodic alarm. On every event burst, debounced 500ms, the listener flushes pending changes into a single `client.update()` call. To prevent local-event-from-remote-apply infinite loops, every URL we apply remotely is parked in an in-memory suppression registry for ~2 seconds; listeners check the registry before pushing.

**Tech Stack:** Continues from prior plans — TypeScript ESM, Vite + crxjs, Vitest for units. **New:** Playwright 1.x for browser e2e.

**Spec reference:** `spec.md` — particularly §"Sync model", §"Initial reconciliation", §"Steady-state listeners", §"ID mapping", §"Native folder ↔ folder string", §"Read sequence (periodic poll)".

**Out of scope (deferred to later plans):**
- Tracking-param URL stripping toggle (spec open question)
- Folder-rename batching (spec open question)
- Subtree-move performance optimization for thousands of bookmarks
- Dedup beyond exact URL match
- Firefox / Safari builds
- Tag UI / web UI

---

## Decisions locked in upfront

These are calls I'm making on the open architectural questions. Each is documented inline so a reviewer can challenge it without spelunking commits.

- **Suppression registry shape:** `Map<string, number>` keyed by normalized URL, value is `Date.now() + 2000`. Cleared on lookup if expired; lazily-GC'd. Lives in module scope of `background.ts`. Survives between messages but resets on service-worker eviction — that's fine because suppression only needs to bridge the gap between "we just applied a remote change" and "the listener fires from that apply".
- **Debounce shape:** single module-scope `pendingChanges` queue + a single `setTimeout` handle. First change starts the 500ms timer; subsequent changes within the window are coalesced. When the timer fires, we call `client.update()` once with all batched mutations folded into a single `mutate` function.
- **Listener strategy:** all four listeners (`onCreated`, `onChanged`, `onMoved`, `onRemoved`) push to the same pending-changes queue. Each event becomes a `{kind, ...payload}` record. The flush function walks the queue and applies each as a pure mutation on the latest `BookmarksFile`.
- **Reconciliation trigger:** record `gitmarks:lastReconciledAt` (epoch ms) in `chrome.storage.local`. On service-worker startup (top-level code in `background.ts`), if the timestamp is missing OR older than 1 hour, schedule a reconciliation. Reconciliation can also be triggered manually via a "Reconcile now" message from the popup — but we don't add that UI in this plan; the alarm-driven path is enough.
- **Apply-remote algorithm:** diff the previously-seen `BookmarksFile` against the freshly-fetched one. For each new bookmark, `chrome.bookmarks.create`. For each tombstoned bookmark we still have a node for, `chrome.bookmarks.remove`. For each updated title/URL/folder, `chrome.bookmarks.update` or `.move`. Every chrome.bookmarks operation registers its URL with the suppression registry BEFORE invoking the API.
- **Skip non-syncable nodes:** any node with `type === "folder"` or no `url` is a folder. We do not store folder-only entries in `bookmarks.json` — folders exist only as derived `folder` path strings on each bookmark. Folders are created on demand when applying remote changes.
- **Bookmarks Bar / Other Bookmarks discovery:** at startup, `chrome.bookmarks.getTree()` returns the root. The two top-level children are Bookmarks Bar (`id`) and Other Bookmarks (`id`). We cache those IDs in module scope to avoid re-querying. If a `folder: ""` bookmark needs creating, parent is Bookmarks Bar's id. If `folder: "_other"`, Other Bookmarks's id. If `folder: "Research/AI"`, walk/create from Bookmarks Bar root.
- **Reconciliation conflict policy on URL collision:** if a URL exists locally AND remotely with different folders, prefer remote. Local-only bookmarks get pushed with `folder = ""` (since we don't know their reverse path without a tree walk — and the steady-state listeners will fix it on the next move event). This is a deliberate v1 simplification.

---

## File Structure

```
packages/extension-chrome/
├── manifest.config.ts                       # MODIFY: add `bookmarks` permission
├── playwright.config.ts                     # NEW
├── package.json                             # MODIFY: add playwright deps + scripts
├── src/
│   ├── background.ts                        # MODIFY: wire listeners, alarm, reconcile
│   └── lib/
│       ├── folder-path.ts                   # NEW: tree↔path conversion (pure)
│       ├── id-mapping.ts                    # NEW: chrome.storage.local-backed map
│       ├── suppression.ts                   # NEW: in-memory TTL set
│       ├── reconcile.ts                     # NEW: initial reconciliation algorithm
│       ├── apply-remote.ts                  # NEW: push BookmarksFile diff → chrome.bookmarks
│       └── listeners.ts                     # NEW: register chrome.bookmarks.* listeners
├── test/                                    # existing unit tests
│   ├── folder-path.test.ts                  # NEW
│   ├── id-mapping.test.ts                   # NEW (uses chrome stub)
│   ├── suppression.test.ts                  # NEW
│   ├── reconcile.test.ts                    # NEW
│   └── apply-remote.test.ts                 # NEW
└── e2e/                                     # NEW
    ├── fixtures.ts                          # Playwright fixture that loads dist/
    ├── github-mock.ts                       # page.route()-based GitHub API mock
    ├── mvp.spec.ts                          # Task 1: smoke for popup + options
    └── sync.spec.ts                         # Task 9: full round-trip
```

---

## Tasks

### Task 0: Playwright e2e infrastructure

**Files:**
- Modify: `packages/extension-chrome/package.json`
- Create: `packages/extension-chrome/playwright.config.ts`
- Create: `packages/extension-chrome/e2e/fixtures.ts`
- Create: `packages/extension-chrome/e2e/github-mock.ts`

Adds Playwright as a dev dep, a config that runs e2e from `e2e/`, a fixture that launches Chrome with the extension loaded, and a GitHub-API mock helper.

- [ ] **Step 1: Add Playwright to `packages/extension-chrome/package.json` devDependencies and scripts**

In the `devDependencies` block, add:
```json
"@playwright/test": "^1.48.0",
```

In the `scripts` block, add (alongside existing scripts):
```json
"e2e": "playwright test",
"e2e:headed": "playwright test --headed",
"pretest:e2e": "vite build"
```

(Note: there's already a `build` script. The `pretest:e2e` script depends on the build being current — `playwright test` itself doesn't auto-build.)

- [ ] **Step 2: Install**

Run: `pnpm install`
Then: `pnpm --filter @gitmarks/extension-chrome exec playwright install chromium`

This downloads the Playwright-bundled Chromium that will host the extension during e2e.

- [ ] **Step 3: Create `packages/extension-chrome/playwright.config.ts`**

```typescript
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    headless: false,
    actionTimeout: 5000,
    navigationTimeout: 10000,
  },
  timeout: 30_000,
});
```

(`workers: 1` because each test launches its own persistent browser context with the extension; running multiple in parallel can hit port-binding races.)

- [ ] **Step 4: Create `packages/extension-chrome/e2e/fixtures.ts`**

```typescript
import { test as base, chromium, type BrowserContext, type Worker } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const extensionPath = resolve(here, "..", "dist");

export interface ExtensionFixtures {
  context: BrowserContext;
  extensionId: string;
  serviceWorker: Worker;
}

export const test = base.extend<ExtensionFixtures>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext("", {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        "--no-sandbox",
      ],
    });
    await use(context);
    await context.close();
  },

  serviceWorker: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    if (worker == null) {
      worker = await context.waitForEvent("serviceworker");
    }
    await use(worker);
  },

  extensionId: async ({ serviceWorker }, use) => {
    const url = new URL(serviceWorker.url());
    await use(url.host);
  },
});

export { expect } from "@playwright/test";
```

(Service workers in MV3 are exposed via `context.serviceWorkers()`. The extension ID is the host portion of the service worker URL: `chrome-extension://<id>/service-worker-loader.js`.)

- [ ] **Step 5: Create `packages/extension-chrome/e2e/github-mock.ts`**

```typescript
import type { BrowserContext } from "@playwright/test";

export interface GitHubMockState {
  bookmarksFile: {
    content: string; // base64
    sha: string;
  } | null;
  shaCounter: number;
}

export interface GitHubMockHandle {
  state: GitHubMockState;
  reset: () => void;
}

export async function installGitHubMock(
  context: BrowserContext,
): Promise<GitHubMockHandle> {
  const state: GitHubMockState = { bookmarksFile: null, shaCounter: 0 };

  function nextSha(): string {
    state.shaCounter += 1;
    return `mock-sha-${state.shaCounter}`;
  }

  await context.route("https://api.github.com/repos/*/*/contents/bookmarks.json**", async (route) => {
    const req = route.request();
    if (req.method() === "GET") {
      if (state.bookmarksFile == null) {
        return route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ message: "Not Found" }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { etag: `"${state.bookmarksFile.sha}"` },
        body: JSON.stringify({
          content: state.bookmarksFile.content,
          sha: state.bookmarksFile.sha,
          encoding: "base64",
        }),
      });
    }
    if (req.method() === "PUT") {
      const body = JSON.parse(req.postData() ?? "{}");
      if (state.bookmarksFile != null && body.sha !== state.bookmarksFile.sha) {
        return route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({ message: "Conflict" }),
        });
      }
      const sha = nextSha();
      state.bookmarksFile = { content: body.content, sha };
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { etag: `"${sha}"` },
        body: JSON.stringify({ content: { sha } }),
      });
    }
    return route.continue();
  });

  // Repo metadata endpoint used by some clients
  await context.route("https://api.github.com/repos/*/*", async (route) => {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ default_branch: "main" }),
    });
  });

  return {
    state,
    reset: () => {
      state.bookmarksFile = null;
      state.shaCounter = 0;
    },
  };
}

export function decodeStoredBookmarks(state: GitHubMockState): unknown {
  if (state.bookmarksFile == null) return null;
  const json = Buffer.from(state.bookmarksFile.content, "base64").toString("utf8");
  return JSON.parse(json);
}

export function seedBookmarksFile(state: GitHubMockState, data: unknown): void {
  const json = JSON.stringify(data, null, 2);
  const content = Buffer.from(json, "utf8").toString("base64");
  state.shaCounter += 1;
  state.bookmarksFile = { content, sha: `mock-sha-${state.shaCounter}` };
}
```

- [ ] **Step 6: Verify by running an empty e2e test**

Create a temporary `e2e/_init.spec.ts`:

```typescript
import { test, expect } from "./fixtures.js";

test("loads the extension and starts a service worker", async ({ extensionId, serviceWorker }) => {
  expect(extensionId).toMatch(/^[a-z]+$/);
  expect(serviceWorker.url()).toContain("service-worker-loader.js");
});
```

Run: `pnpm --filter @gitmarks/extension-chrome e2e`
Expected: Chrome window briefly opens, test passes (1/1).

**If it fails** because of Windows path issues with `extensionPath`: confirm `extensionPath` resolved to an absolute Windows path (use `console.log(extensionPath)` in fixtures.ts). The `--load-extension` arg wants a native-format path.

After verifying success: `git rm e2e/_init.spec.ts` (this was a sanity check; the real first test lands in Task 1).

- [ ] **Step 7: Commit**

```bash
git add packages/extension-chrome/package.json packages/extension-chrome/playwright.config.ts packages/extension-chrome/e2e/fixtures.ts packages/extension-chrome/e2e/github-mock.ts pnpm-lock.yaml
git commit -m "test(extension-chrome): scaffold Playwright e2e infrastructure with extension fixture"
```

---

### Task 1: Smoke e2e for the MVP

**Files:**
- Create: `packages/extension-chrome/e2e/mvp.spec.ts`

This verifies the MVP we already shipped — popup contextual states, options page validation, and the save-current-page flow with a mocked GitHub API.

- [ ] **Step 1: Create `packages/extension-chrome/e2e/mvp.spec.ts`**

```typescript
import { test, expect } from "./fixtures.js";
import { installGitHubMock, decodeStoredBookmarks } from "./github-mock.js";

test.describe("MVP smoke", () => {
  test("popup before setup shows 'Set up gitmarks'", async ({ context, extensionId }) => {
    await installGitHubMock(context);
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/src/popup.html`);
    await expect(page.getByRole("button", { name: "Set up gitmarks" })).toBeVisible();
  });

  test("options page saves settings and popup switches to save view", async ({ context, extensionId }) => {
    await installGitHubMock(context);

    const options = await context.newPage();
    await options.goto(`chrome-extension://${extensionId}/src/options.html`);

    await options.locator("#token").fill("ghp_fake_token");
    await options.locator("#owner").fill("alice");
    await options.locator("#repo").fill("marks");
    await options.locator("#branch").fill("main");
    await options.locator("#save").click();

    await expect(options.locator("#status")).toHaveText("✓ saved");

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/src/popup.html`);
    // Popup needs an active tab. Newly-opened popup reads chrome.tabs which
    // is the most recently-focused tab. Visit a target site first.
    const targetPage = await context.newPage();
    await targetPage.goto("https://example.com/");
    await popup.bringToFront();
    await popup.reload();

    await expect(popup.getByRole("button", { name: "Save this page" })).toBeVisible();
  });

  test("validate button surfaces a friendly result on missing bookmarks.json", async ({ context, extensionId }) => {
    await installGitHubMock(context);
    const options = await context.newPage();
    await options.goto(`chrome-extension://${extensionId}/src/options.html`);
    await options.locator("#token").fill("t");
    await options.locator("#owner").fill("alice");
    await options.locator("#repo").fill("marks");
    await options.locator("#validate").click();
    // The mock returns 404 for bookmarks.json when state is empty, which the
    // options page treats as success ("file not yet created").
    await expect(options.locator("#status")).toContainText("valid PAT");
  });

  test("save flow writes to mocked GitHub", async ({ context, extensionId }) => {
    const mock = await installGitHubMock(context);

    // Configure
    const options = await context.newPage();
    await options.goto(`chrome-extension://${extensionId}/src/options.html`);
    await options.locator("#token").fill("t");
    await options.locator("#owner").fill("alice");
    await options.locator("#repo").fill("marks");
    await options.locator("#save").click();
    await expect(options.locator("#status")).toHaveText("✓ saved");
    await options.close();

    // Active tab
    const target = await context.newPage();
    await target.goto("https://example.com/article");
    // Save via popup
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/src/popup.html`);
    await popup.getByRole("button", { name: "Save this page" }).click();
    await expect(popup.locator("#status")).toHaveText("✓ saved", { timeout: 10_000 });

    // Mock state should contain the new bookmark
    const stored = decodeStoredBookmarks(mock.state) as {
      bookmarks: Array<{ url: string; title: string }>;
    };
    expect(stored.bookmarks.length).toBe(1);
    expect(stored.bookmarks[0]!.url).toBe("https://example.com/article");
  });
});
```

- [ ] **Step 2: Run**

Run: `pnpm --filter @gitmarks/extension-chrome e2e`
Expected: 4 tests pass. (The build runs first via `pretest:e2e`.)

Note: this is the first time the MVP is actually verified end-to-end. If any test fails, fix the underlying issue in the MVP code — the e2e tests are now the source of truth for "MVP works".

- [ ] **Step 3: Commit**

```bash
git add packages/extension-chrome/e2e/mvp.spec.ts
git commit -m "test(extension-chrome): e2e smoke for MVP popup/options/save flow"
```

---

### Task 2: Folder path utilities

**Files:**
- Create: `packages/extension-chrome/src/lib/folder-path.ts`
- Create: `packages/extension-chrome/test/folder-path.test.ts`

Pure functions for converting between `chrome.bookmarks.BookmarkTreeNode` (with parent chain) and the `folder: "Research/AI"` string convention. No `chrome.*` access.

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from "vitest";
import {
  folderPathFromNode,
  splitFolderPath,
  BOOKMARKS_BAR_FOLDER,
  OTHER_BOOKMARKS_FOLDER,
} from "../src/lib/folder-path.js";
import type { TreeNode } from "../src/lib/folder-path.js";

function n(
  id: string,
  title: string,
  parentId?: string,
  url?: string,
): TreeNode {
  return { id, title, parentId, url };
}

describe("folder-path constants", () => {
  it("BOOKMARKS_BAR_FOLDER is empty string", () => {
    expect(BOOKMARKS_BAR_FOLDER).toBe("");
  });
  it("OTHER_BOOKMARKS_FOLDER is '_other'", () => {
    expect(OTHER_BOOKMARKS_FOLDER).toBe("_other");
  });
});

describe("folderPathFromNode", () => {
  it("returns '' for a node directly under Bookmarks Bar", () => {
    const nodesById = new Map<string, TreeNode>();
    nodesById.set("0", n("0", ""));
    nodesById.set("1", n("1", "Bookmarks Bar", "0"));
    nodesById.set("100", n("100", "Article", "1", "https://example.com/"));
    expect(folderPathFromNode(nodesById.get("100")!, nodesById, "1", "2")).toBe("");
  });

  it("returns '_other' for a node directly under Other Bookmarks", () => {
    const nodesById = new Map<string, TreeNode>();
    nodesById.set("0", n("0", ""));
    nodesById.set("2", n("2", "Other Bookmarks", "0"));
    nodesById.set("200", n("200", "Article", "2", "https://example.com/"));
    expect(folderPathFromNode(nodesById.get("200")!, nodesById, "1", "2")).toBe("_other");
  });

  it("joins nested folders under Bookmarks Bar with '/'", () => {
    const nodesById = new Map<string, TreeNode>();
    nodesById.set("0", n("0", ""));
    nodesById.set("1", n("1", "Bookmarks Bar", "0"));
    nodesById.set("10", n("10", "Research", "1"));
    nodesById.set("11", n("11", "AI", "10"));
    nodesById.set("100", n("100", "Paper", "11", "https://example.com/"));
    expect(folderPathFromNode(nodesById.get("100")!, nodesById, "1", "2")).toBe("Research/AI");
  });

  it("prefixes nested-under-Other paths with '_other/'", () => {
    const nodesById = new Map<string, TreeNode>();
    nodesById.set("0", n("0", ""));
    nodesById.set("2", n("2", "Other Bookmarks", "0"));
    nodesById.set("20", n("20", "Reading", "2"));
    nodesById.set("200", n("200", "Article", "20", "https://example.com/"));
    expect(folderPathFromNode(nodesById.get("200")!, nodesById, "1", "2")).toBe("_other/Reading");
  });

  it("returns null when the node is outside the syncable subtree (mobile, managed, etc.)", () => {
    const nodesById = new Map<string, TreeNode>();
    nodesById.set("0", n("0", ""));
    nodesById.set("3", n("3", "Mobile Bookmarks", "0"));
    nodesById.set("300", n("300", "Article", "3", "https://example.com/"));
    expect(folderPathFromNode(nodesById.get("300")!, nodesById, "1", "2")).toBeNull();
  });
});

describe("splitFolderPath", () => {
  it("returns ['bar'] for the root path ''", () => {
    expect(splitFolderPath("")).toEqual({ root: "bar", segments: [] });
  });
  it("returns ['other'] for '_other'", () => {
    expect(splitFolderPath("_other")).toEqual({ root: "other", segments: [] });
  });
  it("returns ['bar', 'Research', 'AI'] for 'Research/AI'", () => {
    expect(splitFolderPath("Research/AI")).toEqual({ root: "bar", segments: ["Research", "AI"] });
  });
  it("returns ['other', 'Reading'] for '_other/Reading'", () => {
    expect(splitFolderPath("_other/Reading")).toEqual({ root: "other", segments: ["Reading"] });
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @gitmarks/extension-chrome test test/folder-path.test.ts`
Expected: fails — file does not exist.

- [ ] **Step 3: Implement `packages/extension-chrome/src/lib/folder-path.ts`**

```typescript
export const BOOKMARKS_BAR_FOLDER = "";
export const OTHER_BOOKMARKS_FOLDER = "_other";

export interface TreeNode {
  id: string;
  title: string;
  parentId?: string;
  url?: string;
}

export function folderPathFromNode(
  node: TreeNode,
  nodesById: Map<string, TreeNode>,
  bookmarksBarId: string,
  otherBookmarksId: string,
): string | null {
  // Walk up to find the root subtree we belong to.
  const ancestry: string[] = [];
  let current: TreeNode | undefined = node;
  while (current != null && current.parentId != null) {
    const parent = nodesById.get(current.parentId);
    if (parent == null) return null;
    if (parent.id === bookmarksBarId) {
      return ancestry.length === 0
        ? BOOKMARKS_BAR_FOLDER
        : [...ancestry].reverse().join("/");
    }
    if (parent.id === otherBookmarksId) {
      return ancestry.length === 0
        ? OTHER_BOOKMARKS_FOLDER
        : [OTHER_BOOKMARKS_FOLDER, ...[...ancestry].reverse()].join("/");
    }
    ancestry.push(parent.title);
    current = parent;
  }
  // Walked to the absolute root without hitting a syncable subtree.
  return null;
}

export interface SplitPath {
  root: "bar" | "other";
  segments: string[];
}

export function splitFolderPath(folder: string): SplitPath {
  if (folder === "" || folder === BOOKMARKS_BAR_FOLDER) {
    return { root: "bar", segments: [] };
  }
  if (folder === OTHER_BOOKMARKS_FOLDER) {
    return { root: "other", segments: [] };
  }
  if (folder.startsWith(OTHER_BOOKMARKS_FOLDER + "/")) {
    return {
      root: "other",
      segments: folder.slice(OTHER_BOOKMARKS_FOLDER.length + 1).split("/"),
    };
  }
  return { root: "bar", segments: folder.split("/") };
}
```

- [ ] **Step 4: Run and verify passing**

Run: `pnpm --filter @gitmarks/extension-chrome test test/folder-path.test.ts`
Expected: 11 tests pass (2 const + 5 folderPathFromNode + 4 splitFolderPath).

- [ ] **Step 5: Commit**

```bash
git add packages/extension-chrome/src/lib/folder-path.ts packages/extension-chrome/test/folder-path.test.ts
git commit -m "feat(extension-chrome): folder path ↔ tree node conversion utilities"
```

---

### Task 3: ID mapping module

**Files:**
- Create: `packages/extension-chrome/src/lib/id-mapping.ts`
- Create: `packages/extension-chrome/test/id-mapping.test.ts`

`chrome.storage.local`-backed bidirectional map of `{ulid → chromeNodeId}` and inverse. Used by listeners (resolve ULID from event's nodeId) and apply-remote (resolve nodeId from incoming bookmark's ULID).

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect } from "vitest";
import {
  loadIdMap,
  saveIdMap,
  setMapping,
  removeUlidMapping,
  removeNodeMapping,
  ulidForNode,
  nodeForUlid,
} from "../src/lib/id-mapping.js";

describe("id-mapping", () => {
  it("loads empty map when nothing stored", async () => {
    const m = await loadIdMap();
    expect(m.ulidToNode.size).toBe(0);
    expect(m.nodeToUlid.size).toBe(0);
  });

  it("saves and reloads", async () => {
    const m = await loadIdMap();
    setMapping(m, "01HXYZ8K7M9P3RQ2V5W6Z8B0C1", "chrome-100");
    await saveIdMap(m);
    const reloaded = await loadIdMap();
    expect(ulidForNode(reloaded, "chrome-100")).toBe("01HXYZ8K7M9P3RQ2V5W6Z8B0C1");
    expect(nodeForUlid(reloaded, "01HXYZ8K7M9P3RQ2V5W6Z8B0C1")).toBe("chrome-100");
  });

  it("setMapping replaces both directions atomically", async () => {
    const m = await loadIdMap();
    setMapping(m, "ulid-1", "node-A");
    setMapping(m, "ulid-1", "node-B");
    expect(nodeForUlid(m, "ulid-1")).toBe("node-B");
    expect(ulidForNode(m, "node-A")).toBeUndefined();
  });

  it("setMapping clears any prior ulid bound to the same node", async () => {
    const m = await loadIdMap();
    setMapping(m, "ulid-1", "node-A");
    setMapping(m, "ulid-2", "node-A");
    expect(ulidForNode(m, "node-A")).toBe("ulid-2");
    expect(nodeForUlid(m, "ulid-1")).toBeUndefined();
  });

  it("removeUlidMapping clears both sides", async () => {
    const m = await loadIdMap();
    setMapping(m, "ulid-x", "node-x");
    removeUlidMapping(m, "ulid-x");
    expect(nodeForUlid(m, "ulid-x")).toBeUndefined();
    expect(ulidForNode(m, "node-x")).toBeUndefined();
  });

  it("removeNodeMapping clears both sides", async () => {
    const m = await loadIdMap();
    setMapping(m, "ulid-x", "node-x");
    removeNodeMapping(m, "node-x");
    expect(nodeForUlid(m, "ulid-x")).toBeUndefined();
    expect(ulidForNode(m, "node-x")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @gitmarks/extension-chrome test test/id-mapping.test.ts`
Expected: fails — file does not exist.

- [ ] **Step 3: Implement `packages/extension-chrome/src/lib/id-mapping.ts`**

```typescript
const KEY = "gitmarks:idMap";

export interface IdMap {
  ulidToNode: Map<string, string>;
  nodeToUlid: Map<string, string>;
}

export async function loadIdMap(): Promise<IdMap> {
  const stored = await chrome.storage.local.get(KEY);
  const raw = stored[KEY];
  const map: IdMap = { ulidToNode: new Map(), nodeToUlid: new Map() };
  if (raw == null || typeof raw !== "object") return map;
  const obj = raw as { entries?: Array<[string, string]> };
  if (!Array.isArray(obj.entries)) return map;
  for (const [ulid, nodeId] of obj.entries) {
    if (typeof ulid !== "string" || typeof nodeId !== "string") continue;
    map.ulidToNode.set(ulid, nodeId);
    map.nodeToUlid.set(nodeId, ulid);
  }
  return map;
}

export async function saveIdMap(map: IdMap): Promise<void> {
  const entries = Array.from(map.ulidToNode.entries());
  await chrome.storage.local.set({ [KEY]: { entries } });
}

export function setMapping(map: IdMap, ulid: string, nodeId: string): void {
  // Clear any previous binding for this ulid or this nodeId
  const prevNode = map.ulidToNode.get(ulid);
  if (prevNode != null) map.nodeToUlid.delete(prevNode);
  const prevUlid = map.nodeToUlid.get(nodeId);
  if (prevUlid != null) map.ulidToNode.delete(prevUlid);
  map.ulidToNode.set(ulid, nodeId);
  map.nodeToUlid.set(nodeId, ulid);
}

export function removeUlidMapping(map: IdMap, ulid: string): void {
  const nodeId = map.ulidToNode.get(ulid);
  map.ulidToNode.delete(ulid);
  if (nodeId != null) map.nodeToUlid.delete(nodeId);
}

export function removeNodeMapping(map: IdMap, nodeId: string): void {
  const ulid = map.nodeToUlid.get(nodeId);
  map.nodeToUlid.delete(nodeId);
  if (ulid != null) map.ulidToNode.delete(ulid);
}

export function ulidForNode(map: IdMap, nodeId: string): string | undefined {
  return map.nodeToUlid.get(nodeId);
}

export function nodeForUlid(map: IdMap, ulid: string): string | undefined {
  return map.ulidToNode.get(ulid);
}
```

- [ ] **Step 4: Run and verify passing**

Run: `pnpm --filter @gitmarks/extension-chrome test test/id-mapping.test.ts`
Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/extension-chrome/src/lib/id-mapping.ts packages/extension-chrome/test/id-mapping.test.ts
git commit -m "feat(extension-chrome): bidirectional ulid↔chromeNodeId mapping persisted in storage"
```

---

### Task 4: Suppression registry

**Files:**
- Create: `packages/extension-chrome/src/lib/suppression.ts`
- Create: `packages/extension-chrome/test/suppression.test.ts`

Module-scope `Map<url, expiresAt>`. When apply-remote is about to mutate `chrome.bookmarks`, it calls `suppress(url)` first. When a listener fires, it calls `isSuppressed(url)` to skip pushing back.

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { suppress, isSuppressed, clearSuppression } from "../src/lib/suppression.js";

describe("suppression", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearSuppression();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("isSuppressed returns false for unregistered URLs", () => {
    expect(isSuppressed("https://example.com/")).toBe(false);
  });

  it("suppress then immediate isSuppressed → true", () => {
    suppress("https://example.com/");
    expect(isSuppressed("https://example.com/")).toBe(true);
  });

  it("isSuppressed returns false after the TTL expires", () => {
    suppress("https://example.com/");
    vi.advanceTimersByTime(2001);
    expect(isSuppressed("https://example.com/")).toBe(false);
  });

  it("re-suppressing the same URL resets the TTL", () => {
    suppress("https://example.com/");
    vi.advanceTimersByTime(1900);
    suppress("https://example.com/");
    vi.advanceTimersByTime(1900);
    expect(isSuppressed("https://example.com/")).toBe(true);
  });

  it("clearSuppression empties the registry", () => {
    suppress("https://example.com/");
    suppress("https://other.com/");
    clearSuppression();
    expect(isSuppressed("https://example.com/")).toBe(false);
    expect(isSuppressed("https://other.com/")).toBe(false);
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @gitmarks/extension-chrome test test/suppression.test.ts`
Expected: fails — file does not exist.

- [ ] **Step 3: Implement `packages/extension-chrome/src/lib/suppression.ts`**

```typescript
const SUPPRESSION_TTL_MS = 2000;

const registry = new Map<string, number>();

export function suppress(url: string): void {
  registry.set(url, Date.now() + SUPPRESSION_TTL_MS);
}

export function isSuppressed(url: string): boolean {
  const expiresAt = registry.get(url);
  if (expiresAt == null) return false;
  if (Date.now() >= expiresAt) {
    registry.delete(url);
    return false;
  }
  return true;
}

export function clearSuppression(): void {
  registry.clear();
}
```

- [ ] **Step 4: Run and verify passing**

Run: `pnpm --filter @gitmarks/extension-chrome test test/suppression.test.ts`
Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/extension-chrome/src/lib/suppression.ts packages/extension-chrome/test/suppression.test.ts
git commit -m "feat(extension-chrome): in-memory URL suppression registry with TTL"
```

---

### Task 5: Apply-remote function

**Files:**
- Create: `packages/extension-chrome/src/lib/apply-remote.ts`
- Create: `packages/extension-chrome/test/apply-remote.test.ts`
- Modify: `packages/extension-chrome/test/setup.ts` (extend chrome stub with `bookmarks.*`)

`applyRemoteChanges(file, idMap, bookmarksBarId, otherBookmarksId)`: take a `BookmarksFile`, look at the current id map, and apply the necessary `chrome.bookmarks.create / update / move / remove` calls. Suppress each URL before each mutation.

For testability we model `chrome.bookmarks` as a simple thunk parameter (a `BookmarksAdapter`) so the function is unit-testable without driving a real Chrome.

- [ ] **Step 1: Extend chrome stub in `test/setup.ts`**

Add this block to the existing `chromeStub` object, between `runtime` and `tabs`:

```typescript
  bookmarks: {
    create: vi.fn(async (props: chrome.bookmarks.CreateDetails) => {
      return { id: `mock-${Math.random().toString(36).slice(2, 10)}`, ...props } as chrome.bookmarks.BookmarkTreeNode;
    }),
    update: vi.fn(async () => ({} as chrome.bookmarks.BookmarkTreeNode)),
    move: vi.fn(async () => ({} as chrome.bookmarks.BookmarkTreeNode)),
    remove: vi.fn(async () => {}),
    getTree: vi.fn(async () => [] as chrome.bookmarks.BookmarkTreeNode[]),
    getSubTree: vi.fn(async () => [] as chrome.bookmarks.BookmarkTreeNode[]),
    onCreated: { addListener: vi.fn(), removeListener: vi.fn() },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    onMoved: { addListener: vi.fn(), removeListener: vi.fn() },
    onRemoved: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  alarms: {
    create: vi.fn(),
    clear: vi.fn(),
    onAlarm: { addListener: vi.fn() },
  },
```

- [ ] **Step 2: Write failing tests**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BookmarksFile } from "@gitmarks/core";
import { applyRemoteChanges } from "../src/lib/apply-remote.js";
import { loadIdMap, setMapping } from "../src/lib/id-mapping.js";
import { clearSuppression, isSuppressed } from "../src/lib/suppression.js";

const BAR = "bar-id";
const OTHER = "other-id";

function bookmark(over: Partial<BookmarksFile["bookmarks"][0]>): BookmarksFile["bookmarks"][0] {
  return {
    id: "01HXYZ8K7M9P3RQ2V5W6Z8B0C1",
    url: "https://example.com/",
    title: "Example",
    folder: "",
    tags: [],
    added_at: "2026-05-23T00:00:00Z",
    updated_at: "2026-05-23T00:00:00Z",
    added_from: "chrome@test",
    deleted_at: null,
    notes: null,
    ...over,
  };
}

function file(bookmarks: BookmarksFile["bookmarks"]): BookmarksFile {
  return { version: 1, updated_at: "2026-05-23T00:00:00Z", bookmarks };
}

describe("applyRemoteChanges", () => {
  beforeEach(() => {
    clearSuppression();
  });

  it("creates new bookmarks not in the id map", async () => {
    const bm = bookmark({ id: "u1", url: "https://example.com/new" });
    const idMap = await loadIdMap();
    await applyRemoteChanges(file([bm]), idMap, BAR, OTHER);
    expect(chrome.bookmarks.create).toHaveBeenCalledWith({
      parentId: BAR,
      title: "Example",
      url: "https://example.com/new",
    });
    expect(isSuppressed("https://example.com/new")).toBe(true);
  });

  it("does not create a bookmark already mapped", async () => {
    const bm = bookmark({ id: "u1", url: "https://example.com/" });
    const idMap = await loadIdMap();
    setMapping(idMap, "u1", "node-1");
    await applyRemoteChanges(file([bm]), idMap, BAR, OTHER);
    expect(chrome.bookmarks.create).not.toHaveBeenCalled();
  });

  it("removes a chrome node for a tombstoned remote bookmark", async () => {
    const bm = bookmark({
      id: "u1",
      url: "https://example.com/",
      deleted_at: "2026-05-23T01:00:00Z",
    });
    const idMap = await loadIdMap();
    setMapping(idMap, "u1", "node-1");
    await applyRemoteChanges(file([bm]), idMap, BAR, OTHER);
    expect(chrome.bookmarks.remove).toHaveBeenCalledWith("node-1");
    expect(isSuppressed("https://example.com/")).toBe(true);
  });

  it("creates _other-rooted bookmarks under Other Bookmarks", async () => {
    const bm = bookmark({ id: "u1", url: "https://example.com/o", folder: "_other" });
    const idMap = await loadIdMap();
    await applyRemoteChanges(file([bm]), idMap, BAR, OTHER);
    expect(chrome.bookmarks.create).toHaveBeenCalledWith({
      parentId: OTHER,
      title: "Example",
      url: "https://example.com/o",
    });
  });
});
```

- [ ] **Step 3: Run and verify failure**

Run: `pnpm --filter @gitmarks/extension-chrome test test/apply-remote.test.ts`
Expected: fails — file does not exist.

- [ ] **Step 4: Implement `packages/extension-chrome/src/lib/apply-remote.ts`**

```typescript
import type { BookmarksFile, Bookmark } from "@gitmarks/core";
import {
  loadIdMap,
  saveIdMap,
  setMapping,
  removeUlidMapping,
  nodeForUlid,
  type IdMap,
} from "./id-mapping.js";
import { splitFolderPath } from "./folder-path.js";
import { suppress } from "./suppression.js";

export async function applyRemoteChanges(
  remote: BookmarksFile,
  idMap: IdMap,
  bookmarksBarId: string,
  otherBookmarksId: string,
): Promise<void> {
  for (const bm of remote.bookmarks) {
    const existingNode = nodeForUlid(idMap, bm.id);

    if (bm.deleted_at != null) {
      if (existingNode != null) {
        suppress(bm.url);
        try {
          await chrome.bookmarks.remove(existingNode);
        } catch {
          // Node may already be gone; ignore.
        }
        removeUlidMapping(idMap, bm.id);
      }
      continue;
    }

    if (existingNode != null) {
      // Already in the local tree — assume it's in sync. Steady-state
      // listeners and the next reconcile will fix any drift.
      continue;
    }

    const parentId = await ensureFolderPath(
      bm.folder,
      bookmarksBarId,
      otherBookmarksId,
    );
    suppress(bm.url);
    const created = await chrome.bookmarks.create({
      parentId,
      title: bm.title,
      url: bm.url,
    });
    setMapping(idMap, bm.id, created.id);
  }
  await saveIdMap(idMap);
}

async function ensureFolderPath(
  folder: string,
  bookmarksBarId: string,
  otherBookmarksId: string,
): Promise<string> {
  const { root, segments } = splitFolderPath(folder);
  let parentId = root === "bar" ? bookmarksBarId : otherBookmarksId;
  for (const segment of segments) {
    parentId = await ensureSubfolder(parentId, segment);
  }
  return parentId;
}

async function ensureSubfolder(parentId: string, title: string): Promise<string> {
  const children = await chrome.bookmarks.getSubTree(parentId);
  const parent = children[0];
  if (parent?.children != null) {
    for (const child of parent.children) {
      if (child.url == null && child.title === title) return child.id;
    }
  }
  const folder = await chrome.bookmarks.create({ parentId, title });
  return folder.id;
}

export type ApplyRemoteFn = (
  remote: BookmarksFile,
  idMap: IdMap,
  bookmarksBarId: string,
  otherBookmarksId: string,
) => Promise<void>;
```

(Note: `loadIdMap`/`saveIdMap` are imported but only `saveIdMap` is used here. We accept `idMap` as a parameter so callers can batch mutations.)

- [ ] **Step 5: Run and verify**

Run: `pnpm --filter @gitmarks/extension-chrome test test/apply-remote.test.ts`
Expected: all 4 tests pass.

Run: `pnpm --filter @gitmarks/extension-chrome test`
Expected: full unit suite passes (existing 20 + folder-path 11 + id-mapping 6 + suppression 5 + apply-remote 4 = 46).

- [ ] **Step 6: Commit**

```bash
git add packages/extension-chrome/src/lib/apply-remote.ts packages/extension-chrome/test/apply-remote.test.ts packages/extension-chrome/test/setup.ts
git commit -m "feat(extension-chrome): apply remote BookmarksFile changes to chrome.bookmarks tree"
```

---

### Task 6: Initial reconciliation

**Files:**
- Create: `packages/extension-chrome/src/lib/reconcile.ts`
- Create: `packages/extension-chrome/test/reconcile.test.ts`

`reconcile(client, idMap, bookmarksBarId, otherBookmarksId, machineId, nowIso)`: implements the spec's pull-then-push algorithm. Reads remote `bookmarks.json`, walks the local tree, computes additions in both directions, performs them.

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect, vi } from "vitest";
import type {
  BookmarksFile,
  GitHubClient,
  Bookmark,
} from "@gitmarks/core";
import { reconcile } from "../src/lib/reconcile.js";
import { loadIdMap, nodeForUlid } from "../src/lib/id-mapping.js";

const BAR = "bar-id";
const OTHER = "other-id";
const machineId = "ABCDE12F";
const nowIso = "2026-05-23T00:00:00Z";

function fakeClient(over: Partial<GitHubClient>): GitHubClient {
  return over as unknown as GitHubClient;
}

function bm(over: Partial<Bookmark>): Bookmark {
  return {
    id: "u1",
    url: "https://example.com/",
    title: "Example",
    folder: "",
    tags: [],
    added_at: nowIso,
    updated_at: nowIso,
    added_from: "chrome@elsewhere",
    deleted_at: null,
    notes: null,
    ...over,
  };
}

describe("reconcile", () => {
  it("creates a new chrome bookmark for a remote-only entry", async () => {
    const remote: BookmarksFile = {
      version: 1,
      updated_at: nowIso,
      bookmarks: [bm({ id: "u1", url: "https://remote.example/" })],
    };
    const update = vi.fn(async (_p, mutate: any) => {
      const next = mutate(remote);
      return { data: next, sha: "s", etag: "" };
    });
    const read = vi.fn(async () => ({ data: remote, sha: "s0", etag: "" }));
    const client = fakeClient({ read, update } as any);

    (chrome.bookmarks.getTree as any).mockResolvedValueOnce([
      { id: "root", children: [
        { id: BAR, title: "Bookmarks Bar", children: [] },
        { id: OTHER, title: "Other Bookmarks", children: [] },
      ] },
    ]);

    const idMap = await loadIdMap();
    await reconcile(client, idMap, BAR, OTHER, machineId, nowIso);

    expect(chrome.bookmarks.create).toHaveBeenCalledWith({
      parentId: BAR,
      title: "Example",
      url: "https://remote.example/",
    });
  });

  it("pushes a local-only bookmark to remote", async () => {
    const remote: BookmarksFile = {
      version: 1,
      updated_at: nowIso,
      bookmarks: [],
    };
    let written: BookmarksFile | null = null;
    const read = vi.fn(async () => ({ data: remote, sha: "s0", etag: "" }));
    const update = vi.fn(async (_p, mutate: any) => {
      written = mutate(remote);
      return { data: written, sha: "s1", etag: "" };
    });
    const client = fakeClient({ read, update } as any);

    (chrome.bookmarks.getTree as any).mockResolvedValueOnce([
      { id: "root", children: [
        { id: BAR, title: "Bookmarks Bar", children: [
          { id: "node-1", parentId: BAR, title: "Local", url: "https://local.example/" },
        ] },
        { id: OTHER, title: "Other Bookmarks", children: [] },
      ] },
    ]);

    const idMap = await loadIdMap();
    await reconcile(client, idMap, BAR, OTHER, machineId, nowIso);

    expect(written).not.toBeNull();
    expect(written!.bookmarks.length).toBe(1);
    expect(written!.bookmarks[0]!.url).toBe("https://local.example/");
    expect(written!.bookmarks[0]!.added_from).toBe("chrome@ABCDE12F");
    expect(nodeForUlid(idMap, written!.bookmarks[0]!.id)).toBe("node-1");
  });

  it("does nothing when local and remote already agree by URL", async () => {
    const remote: BookmarksFile = {
      version: 1,
      updated_at: nowIso,
      bookmarks: [bm({ id: "u-existing", url: "https://shared.example/" })],
    };
    const read = vi.fn(async () => ({ data: remote, sha: "s0", etag: "" }));
    const update = vi.fn();
    const client = fakeClient({ read, update } as any);

    (chrome.bookmarks.getTree as any).mockResolvedValueOnce([
      { id: "root", children: [
        { id: BAR, title: "Bookmarks Bar", children: [
          { id: "node-existing", parentId: BAR, title: "Shared", url: "https://shared.example/" },
        ] },
        { id: OTHER, title: "Other Bookmarks", children: [] },
      ] },
    ]);

    const idMap = await loadIdMap();
    await reconcile(client, idMap, BAR, OTHER, machineId, nowIso);

    // No remote create (since local has it) and no push (since remote has it).
    expect(chrome.bookmarks.create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    // ID map is now linked.
    expect(nodeForUlid(idMap, "u-existing")).toBe("node-existing");
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @gitmarks/extension-chrome test test/reconcile.test.ts`
Expected: fails — file does not exist.

- [ ] **Step 3: Implement `packages/extension-chrome/src/lib/reconcile.ts`**

```typescript
import type {
  BookmarksFile,
  Bookmark,
  GitHubClient,
} from "@gitmarks/core";
import {
  GitHubNotFoundError,
  newUlid,
  normalizeUrl,
  addBookmark,
} from "@gitmarks/core";
import { applyRemoteChanges } from "./apply-remote.js";
import {
  loadIdMap,
  saveIdMap,
  setMapping,
  type IdMap,
} from "./id-mapping.js";

const BOOKMARKS_PATH = "bookmarks.json";

interface LocalEntry {
  nodeId: string;
  url: string;
  title: string;
  /** Parent chain not used in v1 — see plan's locked decisions. */
}

export async function reconcile(
  client: GitHubClient,
  idMap: IdMap,
  bookmarksBarId: string,
  otherBookmarksId: string,
  machineId: string,
  nowIso: string,
): Promise<void> {
  // 1. Load remote (or treat empty if missing)
  let remote: BookmarksFile;
  try {
    const r = await client.read<BookmarksFile>(BOOKMARKS_PATH);
    remote = r.data;
  } catch (err) {
    if (!(err instanceof GitHubNotFoundError)) throw err;
    remote = { version: 1, updated_at: nowIso, bookmarks: [] };
  }

  // 2. Flatten the local tree under Bookmarks Bar + Other Bookmarks
  const localByUrl = await collectLocalBookmarks(bookmarksBarId, otherBookmarksId);

  // 3. Pull remote → local: link existing by URL; create missing
  const remoteByUrl = new Map<string, Bookmark>();
  for (const b of remote.bookmarks) {
    if (b.deleted_at != null) continue;
    remoteByUrl.set(b.url, b);
  }

  for (const [url, b] of remoteByUrl) {
    const existing = localByUrl.get(url);
    if (existing != null) {
      setMapping(idMap, b.id, existing.nodeId);
    }
  }

  await applyRemoteChanges(remote, idMap, bookmarksBarId, otherBookmarksId);

  // 4. Push local-only → remote
  const localOnlyUrls: LocalEntry[] = [];
  for (const [url, local] of localByUrl) {
    if (!remoteByUrl.has(url)) {
      localOnlyUrls.push(local);
    }
  }

  if (localOnlyUrls.length === 0) {
    await saveIdMap(idMap);
    return;
  }

  const newBookmarks: Array<{ entry: LocalEntry; bm: Bookmark }> = [];
  for (const local of localOnlyUrls) {
    const id = newUlid();
    const bm: Bookmark = {
      id,
      url: normalizeUrl(local.url),
      title: local.title,
      folder: "", // v1 simplification
      tags: [],
      added_at: nowIso,
      updated_at: nowIso,
      added_from: `chrome@${machineId}`,
      deleted_at: null,
      notes: null,
    };
    newBookmarks.push({ entry: local, bm });
  }

  await client.update<BookmarksFile>(
    BOOKMARKS_PATH,
    (current) => {
      let next = current;
      for (const { bm } of newBookmarks) {
        next = addBookmark(next, bm, nowIso);
      }
      return next;
    },
    `initial reconciliation from chrome@${machineId}`,
  );

  for (const { entry, bm } of newBookmarks) {
    setMapping(idMap, bm.id, entry.nodeId);
  }
  await saveIdMap(idMap);
}

async function collectLocalBookmarks(
  bookmarksBarId: string,
  otherBookmarksId: string,
): Promise<Map<string, LocalEntry>> {
  const out = new Map<string, LocalEntry>();
  const tree = await chrome.bookmarks.getTree();
  if (tree[0]?.children == null) return out;

  for (const top of tree[0].children) {
    if (top.id !== bookmarksBarId && top.id !== otherBookmarksId) continue;
    walk(top, out);
  }
  return out;
}

function walk(
  node: chrome.bookmarks.BookmarkTreeNode,
  out: Map<string, LocalEntry>,
): void {
  if (node.url != null && node.url.length > 0) {
    out.set(node.url, {
      nodeId: node.id,
      url: node.url,
      title: node.title,
    });
  }
  if (node.children != null) {
    for (const child of node.children) walk(child, out);
  }
}
```

- [ ] **Step 4: Run and verify**

Run: `pnpm --filter @gitmarks/extension-chrome test test/reconcile.test.ts`
Expected: 3 tests pass.

Run: `pnpm --filter @gitmarks/extension-chrome test`
Expected: 49 tests pass (46 prior + 3 reconcile).

- [ ] **Step 5: Commit**

```bash
git add packages/extension-chrome/src/lib/reconcile.ts packages/extension-chrome/test/reconcile.test.ts
git commit -m "feat(extension-chrome): initial reconciliation between local tree and remote file"
```

---

### Task 7: Listeners with debounced batched flush

**Files:**
- Create: `packages/extension-chrome/src/lib/listeners.ts`
- Create: `packages/extension-chrome/test/listeners.test.ts`

Registers `chrome.bookmarks.on*` listeners. Each event is recorded in a pending queue. A 500ms debounce window batches all pending events into one `client.update()` call.

The pending-event model:
- `onCreated(nodeId, node)` → `{kind: "create", nodeId, url, title, folder}`
- `onChanged(nodeId, changeInfo)` → `{kind: "update", nodeId, changes: changeInfo}`
- `onMoved(nodeId, moveInfo)` → `{kind: "move", nodeId, newFolder}`
- `onRemoved(nodeId, removeInfo)` → `{kind: "remove", nodeId}`

When the flush runs, it converts each pending event into a mutation. Events for suppressed URLs are skipped.

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { GitHubClient } from "@gitmarks/core";
import {
  registerListeners,
  flushPending,
  __resetForTest,
} from "../src/lib/listeners.js";
import { loadIdMap, setMapping, saveIdMap } from "../src/lib/id-mapping.js";
import { suppress } from "../src/lib/suppression.js";

const BAR = "bar-id";
const OTHER = "other-id";
const machineId = "ABCDE12F";

function fakeClient(over: any): GitHubClient {
  return over as GitHubClient;
}

describe("listeners", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __resetForTest();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("registerListeners hooks all 4 events", () => {
    registerListeners({
      getClient: async () => fakeClient({}),
      getIdMap: async () => loadIdMap(),
      getBarOtherIds: async () => ({ bar: BAR, other: OTHER }),
      getMachineId: async () => machineId,
    });
    expect(chrome.bookmarks.onCreated.addListener).toHaveBeenCalledTimes(1);
    expect(chrome.bookmarks.onChanged.addListener).toHaveBeenCalledTimes(1);
    expect(chrome.bookmarks.onMoved.addListener).toHaveBeenCalledTimes(1);
    expect(chrome.bookmarks.onRemoved.addListener).toHaveBeenCalledTimes(1);
  });

  it("flush pushes a pending create through GitHubClient.update", async () => {
    const update = vi.fn(async (_p, mutate: any) => {
      const next = mutate({ version: 1, updated_at: "x", bookmarks: [] });
      return { data: next, sha: "s", etag: "" };
    });
    const client = fakeClient({ update });
    const idMap = await loadIdMap();

    registerListeners({
      getClient: async () => client,
      getIdMap: async () => idMap,
      getBarOtherIds: async () => ({ bar: BAR, other: OTHER }),
      getMachineId: async () => machineId,
    });

    const createListener = (chrome.bookmarks.onCreated.addListener as any).mock.calls[0]![0];
    createListener("node-new", {
      id: "node-new",
      parentId: BAR,
      title: "New",
      url: "https://new.example/",
    });

    await flushPending();

    expect(update).toHaveBeenCalledTimes(1);
    const callArgs = update.mock.calls[0]!;
    const mutate = callArgs[1] as (f: any) => any;
    const result = mutate({ version: 1, updated_at: "x", bookmarks: [] });
    expect(result.bookmarks.length).toBe(1);
    expect(result.bookmarks[0]!.url).toBe("https://new.example/");
  });

  it("flush skips events for suppressed URLs", async () => {
    const update = vi.fn(async (_p, mutate: any) => ({ data: mutate({ version: 1, updated_at: "x", bookmarks: [] }), sha: "s", etag: "" }));
    const client = fakeClient({ update });
    const idMap = await loadIdMap();

    registerListeners({
      getClient: async () => client,
      getIdMap: async () => idMap,
      getBarOtherIds: async () => ({ bar: BAR, other: OTHER }),
      getMachineId: async () => machineId,
    });

    suppress("https://suppressed.example/");

    const createListener = (chrome.bookmarks.onCreated.addListener as any).mock.calls[0]![0];
    createListener("node-x", {
      id: "node-x",
      parentId: BAR,
      title: "Sup",
      url: "https://suppressed.example/",
    });

    await flushPending();

    expect(update).not.toHaveBeenCalled();
  });

  it("debounces: multiple rapid events → single flush", async () => {
    const update = vi.fn(async (_p, mutate: any) => ({ data: mutate({ version: 1, updated_at: "x", bookmarks: [] }), sha: "s", etag: "" }));
    const client = fakeClient({ update });

    registerListeners({
      getClient: async () => client,
      getIdMap: async () => loadIdMap(),
      getBarOtherIds: async () => ({ bar: BAR, other: OTHER }),
      getMachineId: async () => machineId,
    });

    const createListener = (chrome.bookmarks.onCreated.addListener as any).mock.calls[0]![0];
    for (let i = 0; i < 5; i++) {
      createListener(`node-${i}`, {
        id: `node-${i}`,
        parentId: BAR,
        title: `T${i}`,
        url: `https://example.com/${i}`,
      });
    }

    // None should have flushed yet
    expect(update).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(600);

    expect(update).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @gitmarks/extension-chrome test test/listeners.test.ts`
Expected: fails — file does not exist.

- [ ] **Step 3: Implement `packages/extension-chrome/src/lib/listeners.ts`**

```typescript
import type {
  Bookmark,
  BookmarksFile,
  GitHubClient,
} from "@gitmarks/core";
import {
  addBookmark,
  newUlid,
  normalizeUrl,
  softDeleteBookmark,
  updateBookmark,
} from "@gitmarks/core";
import {
  setMapping,
  removeUlidMapping,
  removeNodeMapping,
  ulidForNode,
  saveIdMap,
  type IdMap,
} from "./id-mapping.js";
import { isSuppressed } from "./suppression.js";

const DEBOUNCE_MS = 500;
const BOOKMARKS_PATH = "bookmarks.json";

type Pending =
  | { kind: "create"; nodeId: string; url: string; title: string }
  | { kind: "update"; nodeId: string; url?: string; title?: string }
  | { kind: "remove"; nodeId: string };

export interface ListenerDeps {
  getClient: () => Promise<GitHubClient>;
  getIdMap: () => Promise<IdMap>;
  getBarOtherIds: () => Promise<{ bar: string; other: string }>;
  getMachineId: () => Promise<string>;
}

let pending: Pending[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let deps: ListenerDeps | null = null;

export function __resetForTest(): void {
  pending = [];
  if (timer != null) {
    clearTimeout(timer);
    timer = null;
  }
  deps = null;
}

export function registerListeners(d: ListenerDeps): void {
  deps = d;
  chrome.bookmarks.onCreated.addListener(onCreated);
  chrome.bookmarks.onChanged.addListener(onChanged);
  chrome.bookmarks.onMoved.addListener(onMoved);
  chrome.bookmarks.onRemoved.addListener(onRemoved);
}

function schedule(): void {
  if (timer != null) return;
  timer = setTimeout(() => {
    timer = null;
    void flushPending();
  }, DEBOUNCE_MS);
}

function onCreated(_id: string, node: chrome.bookmarks.BookmarkTreeNode): void {
  if (node.url == null || node.url.length === 0) return;
  pending.push({
    kind: "create",
    nodeId: node.id,
    url: node.url,
    title: node.title,
  });
  schedule();
}

function onChanged(id: string, changeInfo: chrome.bookmarks.BookmarkChangeInfo): void {
  pending.push({
    kind: "update",
    nodeId: id,
    url: changeInfo.url,
    title: changeInfo.title,
  });
  schedule();
}

function onMoved(_id: string, _moveInfo: chrome.bookmarks.BookmarkMoveInfo): void {
  // Folder changes are v1.5: we only push title/url updates from listeners.
  // The next reconcile will sync any folder drift.
}

function onRemoved(id: string, _removeInfo: chrome.bookmarks.BookmarkRemoveInfo): void {
  pending.push({ kind: "remove", nodeId: id });
  schedule();
}

export async function flushPending(): Promise<void> {
  if (deps == null) throw new Error("listeners not registered");
  if (pending.length === 0) return;

  const batch = pending;
  pending = [];

  const idMap = await deps.getIdMap();
  const machineId = await deps.getMachineId();
  const nowIso = new Date().toISOString();

  // Filter out suppressed URLs early.
  const surviving = batch.filter((p) => {
    if (p.kind === "create") return !isSuppressed(p.url);
    if (p.kind === "update" && p.url != null) return !isSuppressed(p.url);
    return true;
  });
  if (surviving.length === 0) return;

  const client = await deps.getClient();

  await client.update<BookmarksFile>(
    BOOKMARKS_PATH,
    (current) => applyBatch(current, surviving, idMap, machineId, nowIso),
    `sync ${surviving.length} change(s) from chrome@${machineId}`,
  );

  await saveIdMap(idMap);
}

function applyBatch(
  initial: BookmarksFile,
  batch: Pending[],
  idMap: IdMap,
  machineId: string,
  nowIso: string,
): BookmarksFile {
  let file = initial;
  for (const event of batch) {
    if (event.kind === "create") {
      // Check if we already have a ulid for this nodeId (rare, but possible if
      // the same event fires twice).
      const existingUlid = ulidForNode(idMap, event.nodeId);
      if (existingUlid != null) continue;
      const id = newUlid();
      const bm: Bookmark = {
        id,
        url: normalizeUrl(event.url),
        title: event.title,
        folder: "",
        tags: [],
        added_at: nowIso,
        updated_at: nowIso,
        added_from: `chrome@${machineId}`,
        deleted_at: null,
        notes: null,
      };
      file = addBookmark(file, bm, nowIso);
      setMapping(idMap, id, event.nodeId);
    } else if (event.kind === "update") {
      const ulid = ulidForNode(idMap, event.nodeId);
      if (ulid == null) continue;
      const patch: Partial<Omit<Bookmark, "id">> = {};
      if (event.url != null) patch.url = normalizeUrl(event.url);
      if (event.title != null) patch.title = event.title;
      if (Object.keys(patch).length === 0) continue;
      file = updateBookmark(file, ulid, patch, nowIso);
    } else if (event.kind === "remove") {
      const ulid = ulidForNode(idMap, event.nodeId);
      if (ulid == null) continue;
      file = softDeleteBookmark(file, ulid, nowIso);
      removeNodeMapping(idMap, event.nodeId);
    }
  }
  return file;
}
```

- [ ] **Step 4: Run and verify**

Run: `pnpm --filter @gitmarks/extension-chrome test test/listeners.test.ts`
Expected: 4 tests pass.

Run: `pnpm --filter @gitmarks/extension-chrome test`
Expected: full unit suite passes (53 total = 49 + 4 listeners).

- [ ] **Step 5: Commit**

```bash
git add packages/extension-chrome/src/lib/listeners.ts packages/extension-chrome/test/listeners.test.ts
git commit -m "feat(extension-chrome): debounced chrome.bookmarks.* listeners with batched flush"
```

---

### Task 8: Wire listeners + reconcile + alarm in background.ts

**Files:**
- Modify: `packages/extension-chrome/src/background.ts`
- Modify: `packages/extension-chrome/manifest.config.ts`

This connects everything. On service-worker startup:
1. Discover Bookmarks Bar / Other Bookmarks IDs from `chrome.bookmarks.getTree()`.
2. If settings exist AND last reconcile is missing/stale → run `reconcile`.
3. Register `chrome.bookmarks.*` listeners.
4. Register a `chrome.alarms` periodic alarm for the poll loop.

- [ ] **Step 1: Add `bookmarks` and `alarms` permissions to `manifest.config.ts`**

```typescript
permissions: ["storage", "activeTab", "bookmarks", "alarms"],
```

- [ ] **Step 2: Replace `packages/extension-chrome/src/background.ts`**

```typescript
import {
  GitHubClient,
  GitHubNotFoundError,
  type BookmarksFile,
} from "@gitmarks/core";
import { loadSettings, type Settings } from "./lib/settings.js";
import { getMachineId } from "./lib/machine-id.js";
import {
  saveBookmark,
  type PageInfo,
  type SaveResult,
} from "./lib/save-flow.js";
import {
  loadIdMap,
  type IdMap,
} from "./lib/id-mapping.js";
import { reconcile } from "./lib/reconcile.js";
import { registerListeners } from "./lib/listeners.js";
import { applyRemoteChanges } from "./lib/apply-remote.js";

const RECONCILE_INTERVAL_MS = 60 * 60 * 1000;
const POLL_ALARM_NAME = "gitmarks:poll";
const RECONCILED_AT_KEY = "gitmarks:lastReconciledAt";
const LAST_ETAG_KEY = "gitmarks:bookmarksEtag";

let cachedBarId: string | null = null;
let cachedOtherId: string | null = null;

async function getBarOtherIds(): Promise<{ bar: string; other: string }> {
  if (cachedBarId != null && cachedOtherId != null) {
    return { bar: cachedBarId, other: cachedOtherId };
  }
  const tree = await chrome.bookmarks.getTree();
  const root = tree[0];
  if (root?.children == null || root.children.length < 2) {
    throw new Error("unexpected chrome.bookmarks tree shape");
  }
  cachedBarId = root.children[0]!.id;
  cachedOtherId = root.children[1]!.id;
  return { bar: cachedBarId, other: cachedOtherId };
}

async function buildClient(settings: Settings): Promise<GitHubClient> {
  return new GitHubClient({
    owner: settings.owner,
    repo: settings.repo,
    token: settings.token,
    branch: settings.branch,
  });
}

async function maybeReconcile(): Promise<void> {
  const settings = await loadSettings();
  if (settings == null) return;

  const stored = await chrome.storage.local.get(RECONCILED_AT_KEY);
  const last = typeof stored[RECONCILED_AT_KEY] === "number"
    ? (stored[RECONCILED_AT_KEY] as number)
    : 0;
  if (Date.now() - last < RECONCILE_INTERVAL_MS) return;

  const { bar, other } = await getBarOtherIds();
  const client = await buildClient(settings);
  const idMap = await loadIdMap();
  const machineId = await getMachineId();
  const nowIso = new Date().toISOString();

  try {
    await reconcile(client, idMap, bar, other, machineId, nowIso);
    await chrome.storage.local.set({ [RECONCILED_AT_KEY]: Date.now() });
  } catch (err) {
    console.warn("[gitmarks] reconcile failed", err);
  }
}

async function pollRemoteOnce(): Promise<void> {
  const settings = await loadSettings();
  if (settings == null) return;
  const client = await buildClient(settings);
  const stored = await chrome.storage.local.get(LAST_ETAG_KEY);
  const etag = typeof stored[LAST_ETAG_KEY] === "string"
    ? (stored[LAST_ETAG_KEY] as string)
    : null;

  try {
    const result = etag
      ? await client.readIfChanged<BookmarksFile>("bookmarks.json", etag)
      : await client.read<BookmarksFile>("bookmarks.json");
    if (result == null) return;
    const { bar, other } = await getBarOtherIds();
    const idMap = await loadIdMap();
    await applyRemoteChanges(result.data, idMap, bar, other);
    await chrome.storage.local.set({ [LAST_ETAG_KEY]: result.etag });
  } catch (err) {
    if (err instanceof GitHubNotFoundError) return;
    console.warn("[gitmarks] poll failed", err);
  }
}

// Message handler (unchanged from MVP) ----
interface SaveCurrentPageMessage {
  type: "save-current-page";
  page: PageInfo;
}
type IncomingMessage = SaveCurrentPageMessage;

chrome.runtime.onMessage.addListener(
  (msg: IncomingMessage, _sender, sendResponse) => {
    if (msg?.type !== "save-current-page") return false;
    void handleSavePage(msg.page).then(sendResponse);
    return true;
  },
);

async function handleSavePage(page: PageInfo): Promise<SaveResult> {
  const settings = await loadSettings();
  if (settings == null) {
    return {
      ok: false,
      kind: "not_configured",
      message: "gitmarks is not configured. Open Options to set up.",
    };
  }
  const client = await buildClient(settings);
  const machineId = await getMachineId();
  return saveBookmark(client, page, machineId, new Date().toISOString());
}

// Listeners + alarm ----
registerListeners({
  getClient: async () => {
    const s = await loadSettings();
    if (s == null) throw new Error("no settings");
    return buildClient(s);
  },
  getIdMap: async () => loadIdMap(),
  getBarOtherIds,
  getMachineId,
});

chrome.alarms.create(POLL_ALARM_NAME, { periodInMinutes: 5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === POLL_ALARM_NAME) {
    void pollRemoteOnce();
  }
});

// Kick off initial reconcile if needed
void maybeReconcile();
```

- [ ] **Step 3: Verify build, typecheck, unit tests**

Run: `pnpm --filter @gitmarks/extension-chrome typecheck`
Expected: exit 0.

Run: `pnpm --filter @gitmarks/extension-chrome test`
Expected: 53 tests pass.

Run: `pnpm --filter @gitmarks/extension-chrome build`
Expected: clean build. `dist/manifest.json` should now show `"permissions": ["storage", "activeTab", "bookmarks", "alarms"]`.

- [ ] **Step 4: Commit**

```bash
git add packages/extension-chrome/src/background.ts packages/extension-chrome/manifest.config.ts
git commit -m "feat(extension-chrome): wire native tree listeners, reconcile, and 5-min poll alarm"
```

---

### Task 9: End-to-end sync test

**Files:**
- Create: `packages/extension-chrome/e2e/sync.spec.ts`

A round-trip e2e: configure the extension, add a bookmark via `chrome.bookmarks.create` from the e2e script, wait for the debounce flush, assert the mocked GitHub API received the corresponding `PUT bookmarks.json`. Then mutate the mock state, trigger a poll, assert the local tree updates.

- [ ] **Step 1: Create `packages/extension-chrome/e2e/sync.spec.ts`**

```typescript
import { test, expect } from "./fixtures.js";
import {
  installGitHubMock,
  decodeStoredBookmarks,
  seedBookmarksFile,
} from "./github-mock.js";

// Helper: drive the extension's service worker via the WorkerRunner
async function configureExtension(
  context: import("@playwright/test").BrowserContext,
  extensionId: string,
): Promise<void> {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/src/options.html`);
  await options.locator("#token").fill("t");
  await options.locator("#owner").fill("alice");
  await options.locator("#repo").fill("marks");
  await options.locator("#save").click();
  await expect(options.locator("#status")).toHaveText("✓ saved");
  await options.close();
}

test.describe("native tree sync", () => {
  test("creating a bookmark via chrome.bookmarks → pushes to GitHub", async ({
    context,
    extensionId,
    serviceWorker,
  }) => {
    const mock = await installGitHubMock(context);
    await configureExtension(context, extensionId);

    // Call chrome.bookmarks.create from the service-worker context
    await serviceWorker.evaluate(async () => {
      const tree = await chrome.bookmarks.getTree();
      const bar = tree[0]!.children![0]!;
      await chrome.bookmarks.create({
        parentId: bar.id,
        title: "Inserted via e2e",
        url: "https://e2e.example/inserted",
      });
    });

    // Wait for the 500ms debounce + the GitHub PUT round-trip
    await expect.poll(() => mock.state.bookmarksFile != null, { timeout: 5000 }).toBeTruthy();

    const stored = decodeStoredBookmarks(mock.state) as {
      bookmarks: Array<{ url: string; title: string }>;
    };
    expect(stored.bookmarks.length).toBe(1);
    expect(stored.bookmarks[0]!.url).toBe("https://e2e.example/inserted");
    expect(stored.bookmarks[0]!.title).toBe("Inserted via e2e");

    // Clean up the bookmark so this test doesn't leak into shared Chrome state
    await serviceWorker.evaluate(async (title) => {
      const tree = await chrome.bookmarks.getTree();
      const bar = tree[0]!.children![0]!;
      const node = bar.children?.find((c) => c.title === title);
      if (node != null) await chrome.bookmarks.remove(node.id);
    }, "Inserted via e2e");
  });

  test("poll: remote add → local chrome.bookmarks gets the entry", async ({
    context,
    extensionId,
    serviceWorker,
  }) => {
    const mock = await installGitHubMock(context);
    await configureExtension(context, extensionId);

    seedBookmarksFile(mock.state, {
      version: 1,
      updated_at: "2026-05-23T00:00:00Z",
      bookmarks: [
        {
          id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CA",
          url: "https://e2e.example/from-remote",
          title: "From remote",
          folder: "",
          tags: [],
          added_at: "2026-05-23T00:00:00Z",
          updated_at: "2026-05-23T00:00:00Z",
          added_from: "chrome@other",
          deleted_at: null,
          notes: null,
        },
      ],
    });

    // Trigger poll
    await serviceWorker.evaluate(async () => {
      await chrome.alarms.create("gitmarks:poll", { when: Date.now() });
    });

    // Wait until the bookmark appears in the local tree
    await expect.poll(async () => {
      const found = await serviceWorker.evaluate(async (url) => {
        const tree = await chrome.bookmarks.getTree();
        const bar = tree[0]!.children![0]!;
        return bar.children?.some((c) => c.url === url) ?? false;
      }, "https://e2e.example/from-remote");
      return found;
    }, { timeout: 10_000 }).toBeTruthy();

    // Cleanup
    await serviceWorker.evaluate(async (url) => {
      const tree = await chrome.bookmarks.getTree();
      const bar = tree[0]!.children![0]!;
      const node = bar.children?.find((c) => c.url === url);
      if (node != null) await chrome.bookmarks.remove(node.id);
    }, "https://e2e.example/from-remote");
  });
});
```

- [ ] **Step 2: Run**

Run: `pnpm --filter @gitmarks/extension-chrome e2e`
Expected: 4 MVP tests (from Task 1) + 2 sync tests = 6 e2e tests pass.

If the second test (poll) times out: the alarm path may not fire from `chrome.alarms.create({ when: Date.now() })` immediately. Try setting `when: Date.now() + 1000` to give a 1-second delay, OR call `pollRemoteOnce` directly via a special test-only message handler. (If that's needed, document it in the commit message — the alarm not firing immediately is a real Chrome behavior.)

- [ ] **Step 3: Commit**

```bash
git add packages/extension-chrome/e2e/sync.spec.ts
git commit -m "test(extension-chrome): e2e for local→remote push and remote→local poll"
```

---

### Task 10: README updates + final smoke

**Files:**
- Modify: `packages/extension-chrome/README.md`

Update the README to reflect the new functionality (native tree sync is live, 5-min poll, reconcile on cold start) and the new manual smoke test items.

- [ ] **Step 1: Modify `packages/extension-chrome/README.md`**

Replace the existing "Out of scope for this MVP" section with the following (which moves now-implemented items into the architecture notes and shrinks the deferred list):

Replace this block:
```
## Out of scope for this MVP

- `chrome.bookmarks.*` listeners (live sync from the native tree)
- 5-min poll loop (sync changes from other devices)
- ID-mapping table
- Folder support beyond root
- Tags UI (tags live in the JSON but no UI to edit them here yet)
- Icons (Chrome shows the default puzzle piece)
- Conflict resolution beyond core's automatic 409 retry
```

With:
```
## Out of scope (still)

- Folder support beyond reads — listeners do not push folder changes from
  `onMoved` events yet (next reconcile picks them up)
- Tags UI (tags live in the JSON but no UI to edit them here yet)
- Icons (Chrome shows the default puzzle piece)
- Conflict resolution beyond core's automatic 409 retry
- Tracking-param URL stripping
- Folder-rename batching for thousands of bookmarks
```

Append this to the existing "Architecture notes" section:

```
- Live two-way sync is enabled:
  - `chrome.bookmarks.onCreated/onChanged/onRemoved` push debounced
    (500ms) batches to `bookmarks.json` via `client.update()`.
  - A `chrome.alarms` periodic alarm polls `bookmarks.json` every 5 minutes
    using ETag conditional reads (304s don't count against the GitHub
    rate limit).
  - On service-worker cold start, if more than an hour has passed since
    the last reconciliation, the extension reads both sides and merges.
- An in-memory suppression registry prevents loop-back: when we apply a
  remote change to `chrome.bookmarks`, our own listeners fire — those URLs
  are suppressed for ~2 seconds so we don't echo them back.
- `chrome.storage.local` holds: settings, machine ID, ID map
  (`{ulid: chromeNodeId}`), last-reconciled timestamp, last bookmarks.json
  ETag.
```

Add a new section after "Manual smoke test" with the native-tree-specific test steps:

```
## Manual smoke test — native tree (after Task 8)

In addition to the MVP checklist above:

- [ ] Configure the extension with a real PAT + repo (as before).
- [ ] In Chrome, drag any URL to the bookmarks bar. Wait ~1s. Refresh
      `bookmarks.json` on github.com. The entry should appear with
      `folder: ""` and `added_from: "chrome@<id>"`.
- [ ] Right-click that bookmark → Edit → change the title. Refresh GitHub
      after ~1s. The title should be updated.
- [ ] Delete the bookmark from Chrome. Refresh GitHub. The entry now has
      a `deleted_at` timestamp (soft delete; the JSON entry remains until
      GC after 30 days).
- [ ] Edit `bookmarks.json` directly on GitHub: add a new bookmark with a
      fresh ULID, then save the commit. Within ~5 minutes the bookmark
      appears in Chrome's bookmarks bar without you doing anything.
      (To trigger immediately, restart the browser — the cold-start
      reconcile path runs.)
```

Add a new section about automated e2e:

```
## Automated e2e

Browser-driven integration tests live in `e2e/`. They launch a real
Chromium instance with the extension loaded, mock the GitHub API via
Playwright route interception, and drive the extension end-to-end.

```bash
pnpm --filter @gitmarks/extension-chrome e2e
```

Currently covers:
- Popup contextual states (set-up vs. save)
- Options page validate + save
- Save-current-page round-trip
- chrome.bookmarks.create → GitHub PUT
- GitHub change → chrome.bookmarks update (poll-triggered)

Adding new browser-driven assertions: create another `*.spec.ts` in
`e2e/`, import `test, expect` from `./fixtures.js`, and use the
`extensionId`, `serviceWorker`, and `context` fixtures.
```

**NOTE:** when writing the README, use literal triple-backticks (three `` ` `` characters in a row) for code fences. Do not escape them.

- [ ] **Step 2: Final full-suite verification**

Run: `pnpm --filter @gitmarks/extension-chrome test`
Expected: 53 unit tests pass.

Run: `pnpm --filter @gitmarks/extension-chrome e2e`
Expected: 6 e2e tests pass.

Run: `pnpm --filter @gitmarks/extension-chrome typecheck`
Expected: exit 0.

Run: `pnpm --filter @gitmarks/extension-chrome build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add packages/extension-chrome/README.md
git commit -m "docs(extension-chrome): document native tree sync, poll, and e2e workflow"
```

---

## Self-review summary

**Spec coverage:**

| Spec section | Covered by |
|---|---|
| §"Sync model" — event-driven push, periodic poll | Tasks 7 (listeners) + 8 (poll alarm) |
| §"Initial reconciliation" — read both, merge by URL | Task 6 (reconcile) |
| §"Steady-state listeners" — onCreated/onChanged/onRemoved/onMoved | Task 7 |
| §"ID mapping" — {ulid: chromeNodeId} persisted, rebuilt by URL | Task 3 + Task 6 |
| §"Native folder ↔ folder string" — `""` / `"_other"` / `"A/B"` | Task 2 |
| §"Read sequence (periodic poll)" — 5-min via chrome.alarms, ETag, diff | Task 8 |
| §"Write sequence (single change)" — debounce 500ms | Task 7 (DEBOUNCE_MS = 500) |
| §"Conflict scenarios" — own-listener loop suppression | Task 4 (suppression registry) |

**Out of scope explicitly:**

- `onMoved`-driven folder updates push to remote (listeners only push title/url; folder drift is picked up by the next reconcile)
- Subtree-move batching
- Tracking-param URL normalization
- Folder rename when N bookmarks live underneath
- Firefox / Safari builds

**Placeholder scan:** none.

**Type/name consistency:** `BookmarksFile`, `Bookmark`, `GitHubClient`, `Settings`, `PageInfo`, `SaveResult`, `IdMap`, `Pending`, `ListenerDeps`, `BOOKMARKS_BAR_FOLDER`, `OTHER_BOOKMARKS_FOLDER`, `suppress`, `isSuppressed`, `loadIdMap`, `saveIdMap`, `setMapping`, `ulidForNode`, `nodeForUlid`, `applyRemoteChanges`, `reconcile`, `registerListeners`, `flushPending` — all used identically across tasks.

**Verification:** by the end of Task 10, the extension passes 53 unit tests + 6 Playwright e2e tests + clean typecheck + clean build. The native-tree manual smoke test in the README documents what cannot be verified in Playwright (user-driven drag-to-bar gestures, etc.).
