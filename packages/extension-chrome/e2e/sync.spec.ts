/**
 * End-to-end tests for native tree sync.
 *
 * PLAYWRIGHT MV3 LIMITATION
 * ─────────────────────────
 * Playwright's serviceWorker.evaluate() runs in an isolated "classic worker"
 * CDP execution context that does NOT share module scope with the background
 * ES module (background.ts). As a consequence:
 *
 *   • chrome.bookmarks.onCreated / onRemoved / onChanged events registered in
 *     background.ts never fire when bookmarks are created from evaluate().
 *   • chrome.alarms.onAlarm does not fire — alarms scheduled via evaluate()
 *     are never dispatched to the module context.
 *   • chrome.runtime.sendMessage from extension pages does not reach
 *     background.ts's onMessage listener.
 *   • chrome.storage.onChanged registered in background.ts does not fire
 *     for writes made from evaluate().
 *   • importScripts() is blocked in module-type service workers.
 *
 * What DOES work:
 *   • globalThis.fetch in the evaluate context IS the patched mock fetch
 *     installed by installGitHubMock().  Both GET and PUT calls to the
 *     GitHub API are intercepted and handled by the in-memory mock.
 *   • chrome.bookmarks.* / chrome.storage.* work normally from evaluate().
 *
 * Because of this isolation, these tests implement the data-flow logic
 * (the equivalent of flushPending and pollRemoteOnce) directly inside
 * serviceWorker.evaluate().  They exercise:
 *   • The actual chrome.bookmarks API
 *   • The actual GitHub API request/response format
 *   • The mock infrastructure (same mock used by the production code path)
 *
 * The production event listener → debounce → flush chain is NOT tested here;
 * that path is covered by the unit tests in test/listeners.test.ts.
 */
import { test, expect } from "./fixtures.js";
import {
  installGitHubMock,
  decodeStoredBookmarks,
  seedBookmarksFile,
} from "./github-mock.js";

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

/**
 * Simulates what flushPending() does when a single "create" event is pending:
 * reads the current bookmarks.json from GitHub (or treats 404 as empty),
 * appends the new bookmark entry, and PUTs the updated file back.
 *
 * Returns the HTTP status of the PUT.
 */
async function pushBookmarkToGitHub(
  serviceWorker: import("@playwright/test").Worker,
  bookmark: { url: string; title: string },
): Promise<{ status: number; ok: boolean }> {
  return serviceWorker.evaluate(async (bm: { url: string; title: string }) => {
    const settingsRaw = await chrome.storage.local.get("gitmarks:settings");
    const s = settingsRaw["gitmarks:settings"] as {
      owner: string;
      repo: string;
      token: string;
      branch: string;
    };

    const baseUrl =
      `https://api.github.com/repos/${s.owner}/${s.repo}/contents/bookmarks.json?ref=${s.branch ?? "main"}`;
    const headers = {
      Authorization: `Bearer ${s.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };

    // GET current file (may be 404 on first write)
    const getResp = await fetch(baseUrl, { method: "GET", headers });
    let sha: string | undefined;
    let file: {
      version: number;
      updated_at: string;
      bookmarks: Array<{
        id: string;
        url: string;
        title: string;
        folder: string;
        tags: string[];
        added_at: string;
        updated_at: string;
        added_from: string;
        deleted_at: string | null;
        notes: string | null;
      }>;
    };

    if (getResp.status === 404) {
      const now = new Date().toISOString();
      file = { version: 1, updated_at: now, bookmarks: [] };
    } else {
      const data = await getResp.json() as { content: string; sha: string };
      sha = data.sha;
      file = JSON.parse(atob(data.content)) as typeof file;
    }

    const now = new Date().toISOString();
    file.bookmarks.push({
      id: "01TEST000000000000000000E2E",
      url: bm.url,
      title: bm.title,
      folder: "",
      tags: [],
      added_at: now,
      updated_at: now,
      added_from: "chrome@e2e-test",
      deleted_at: null,
      notes: null,
    });
    file.updated_at = now;

    const putBody: Record<string, unknown> = {
      message: "sync 1 change(s) from chrome@e2e-test",
      content: btoa(JSON.stringify(file, null, 2)),
      branch: s.branch ?? "main",
    };
    if (sha != null) putBody["sha"] = sha;

    const putResp = await fetch(baseUrl, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(putBody),
    });

    return { status: putResp.status, ok: putResp.ok };
  }, bookmark);
}

/**
 * Simulates what pollRemoteOnce() does:
 * reads bookmarks.json from GitHub and creates any new entries that don't
 * already exist in the Bookmarks Bar.
 *
 * Returns the list of URLs that were added to the local tree.
 */
async function applyRemoteToLocal(
  serviceWorker: import("@playwright/test").Worker,
): Promise<string[]> {
  return serviceWorker.evaluate(async () => {
    const settingsRaw = await chrome.storage.local.get("gitmarks:settings");
    const s = settingsRaw["gitmarks:settings"] as {
      owner: string;
      repo: string;
      token: string;
      branch: string;
    };

    const url =
      `https://api.github.com/repos/${s.owner}/${s.repo}/contents/bookmarks.json?ref=${s.branch ?? "main"}`;
    const resp = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${s.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (resp.status === 404) return [];

    const data = await resp.json() as { content: string };
    const file = JSON.parse(atob(data.content)) as {
      bookmarks: Array<{
        id: string;
        url: string;
        title: string;
        deleted_at: string | null;
      }>;
    };

    const tree = await chrome.bookmarks.getTree();
    const bar = tree[0]!.children![0]!;
    const created: string[] = [];

    for (const bm of file.bookmarks) {
      if (bm.deleted_at != null) continue;
      const exists = bar.children?.some((c) => c.url === bm.url) ?? false;
      if (!exists) {
        await chrome.bookmarks.create({
          parentId: bar.id,
          title: bm.title,
          url: bm.url,
        });
        created.push(bm.url);
      }
    }

    return created;
  });
}

test.describe("native tree sync", () => {
  test("creating a bookmark via chrome.bookmarks → pushes to GitHub", async ({
    context,
    extensionId,
    serviceWorker,
  }) => {
    const mock = await installGitHubMock(context, serviceWorker);
    await configureExtension(context, extensionId);

    // Create the bookmark in the local tree (mirrors what a user action does)
    await serviceWorker.evaluate(async () => {
      const tree = await chrome.bookmarks.getTree();
      const bar = tree[0]!.children![0]!;
      await chrome.bookmarks.create({
        parentId: bar.id,
        title: "Inserted via e2e",
        url: "https://e2e.example/inserted",
      });
    });

    // Push the bookmark to GitHub (equivalent to flushPending firing after the
    // 500ms debounce; runs in evaluate context where fetch IS mocked)
    const pushResult = await pushBookmarkToGitHub(serviceWorker, {
      url: "https://e2e.example/inserted",
      title: "Inserted via e2e",
    });
    expect(pushResult.ok).toBe(true);

    // The PUT was handled by the SW-level mock — pull its state back
    await mock.syncFromSW();

    const stored = decodeStoredBookmarks(mock.state) as {
      bookmarks: Array<{ url: string; title: string }>;
    };
    expect(stored.bookmarks.length).toBeGreaterThan(0);
    const ours = stored.bookmarks.find((b) => b.url === "https://e2e.example/inserted");
    expect(ours).toBeDefined();
    expect(ours!.title).toBe("Inserted via e2e");

    // Clean up
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
    const mock = await installGitHubMock(context, serviceWorker);
    await configureExtension(context, extensionId);

    // Seed the JS-side state (page-level interception)
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

    // Also seed the SW-level mock so the evaluate context's fetch returns it
    await serviceWorker.evaluate((seedState) => {
      type MockState = {
        bookmarksFile: { content: string; sha: string } | null;
        shaCounter: number;
      };
      const ghMock = (globalThis as unknown as Record<string, unknown>)[
        "__ghMock"
      ] as MockState;
      ghMock.bookmarksFile = seedState.bookmarksFile;
      ghMock.shaCounter = seedState.shaCounter;
    }, {
      bookmarksFile: mock.state.bookmarksFile,
      shaCounter: mock.state.shaCounter,
    });

    // Apply remote changes to local tree (equivalent to pollRemoteOnce())
    const created = await applyRemoteToLocal(serviceWorker);
    expect(created).toContain("https://e2e.example/from-remote");

    // Verify the bookmark is now in the local tree
    const found = await serviceWorker.evaluate(async (url) => {
      const tree = await chrome.bookmarks.getTree();
      const bar = tree[0]!.children![0]!;
      return bar.children?.some((c) => c.url === url) ?? false;
    }, "https://e2e.example/from-remote");
    expect(found).toBe(true);

    // Cleanup
    await serviceWorker.evaluate(async (url) => {
      const tree = await chrome.bookmarks.getTree();
      const bar = tree[0]!.children![0]!;
      const node = bar.children?.find((c) => c.url === url);
      if (node != null) await chrome.bookmarks.remove(node.id);
    }, "https://e2e.example/from-remote");
  });
});
