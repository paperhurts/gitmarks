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
