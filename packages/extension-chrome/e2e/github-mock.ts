import type { BrowserContext, Worker } from "@playwright/test";

export interface GitHubMockState {
  bookmarksFile: {
    content: string; // base64
    sha: string;
  } | null;
  shaCounter: number;
}

export interface GitHubMockHandle {
  state: GitHubMockState;
  /**
   * For service-worker-backed saves, the state lives inside the SW scope.
   * Call this to pull the latest SW state into the JS-side `state` object.
   */
  syncFromSW: () => Promise<void>;
  reset: () => void;
}

/**
 * Installs a GitHub API mock on both the browser-context route layer (for
 * requests from regular pages, e.g. the options page validate button) and
 * directly inside the extension service worker (for requests from background.ts,
 * which bypass Playwright's context.route() interception).
 */
export async function installGitHubMock(
  context: BrowserContext,
  serviceWorker?: Worker,
): Promise<GitHubMockHandle> {
  const state: GitHubMockState = { bookmarksFile: null, shaCounter: 0 };

  function nextSha(): string {
    state.shaCounter += 1;
    return `mock-sha-${state.shaCounter}`;
  }

  // --- Page-level interception (for options.ts, popup.ts direct fetch calls) ---
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

  await context.route("https://api.github.com/repos/*/*", async (route) => {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ default_branch: "main" }),
    });
  });

  // --- Service-worker-level interception ---
  // context.route() does NOT intercept fetch calls made from the extension's
  // service worker (they run in a privileged SW context that bypasses CDP
  // network interception). We patch globalThis.fetch inside the SW instead.
  if (serviceWorker != null) {
    await serviceWorker.evaluate(() => {
      // Install a mock GitHub API handler on the SW global scope.
      // State is stored in __ghMock so the test can read it back.
      type MockState = {
        bookmarksFile: { content: string; sha: string } | null;
        shaCounter: number;
      };
      (globalThis as unknown as Record<string, unknown>)["__ghMock"] = {
        bookmarksFile: null,
        shaCounter: 0,
      } satisfies MockState;

      const real = globalThis.fetch.bind(globalThis);
      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
        const method = init?.method?.toUpperCase() ?? (typeof input !== "string" && !(input instanceof URL) ? (input as Request).method : "GET");

        if (!url.includes("api.github.com/repos/")) {
          return real(input, init);
        }

        const mock = (globalThis as unknown as Record<string, unknown>)["__ghMock"] as MockState;

        // Match contents endpoint: .../contents/bookmarks.json
        if (/\/contents\/bookmarks\.json/.test(url)) {
          if (method === "GET") {
            if (mock.bookmarksFile == null) {
              return new Response(JSON.stringify({ message: "Not Found" }), {
                status: 404,
                headers: { "Content-Type": "application/json" },
              });
            }
            return new Response(
              JSON.stringify({
                content: mock.bookmarksFile.content,
                sha: mock.bookmarksFile.sha,
                encoding: "base64",
              }),
              {
                status: 200,
                headers: {
                  "Content-Type": "application/json",
                  etag: `"${mock.bookmarksFile.sha}"`,
                },
              },
            );
          }
          if (method === "PUT") {
            const reqBody = JSON.parse(
              init?.body != null ? String(init.body) : "{}"
            ) as { content: string; sha?: string };
            if (mock.bookmarksFile != null && reqBody.sha !== mock.bookmarksFile.sha) {
              return new Response(JSON.stringify({ message: "Conflict" }), {
                status: 409,
                headers: { "Content-Type": "application/json" },
              });
            }
            mock.shaCounter += 1;
            const sha = `mock-sha-${mock.shaCounter}`;
            mock.bookmarksFile = { content: reqBody.content, sha };
            return new Response(
              JSON.stringify({ content: { sha } }),
              {
                status: 200,
                headers: {
                  "Content-Type": "application/json",
                  etag: `"${sha}"`,
                },
              },
            );
          }
        }

        // Match repo root (for validate)
        if (/\/repos\/[^/]+\/[^/]+$/.test(url)) {
          return new Response(JSON.stringify({ default_branch: "main" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        return real(input, init);
      };
    });
  }

  const syncFromSW = async (): Promise<void> => {
    if (serviceWorker == null) return;
    const swState = await serviceWorker.evaluate(() => {
      return (globalThis as unknown as Record<string, unknown>)["__ghMock"];
    }) as GitHubMockState;
    state.bookmarksFile = swState.bookmarksFile;
    state.shaCounter = swState.shaCounter;
  };

  return {
    state,
    syncFromSW,
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
