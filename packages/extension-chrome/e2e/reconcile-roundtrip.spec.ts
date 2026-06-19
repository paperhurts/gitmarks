import { test, expect } from "./fixtures";

// Real end-to-end against GitHub: a bookmark in the native tree + completing
// setup must result in the live service worker writing it to bookmarks.json in
// the configured repo. This is the path that was silently dead before #57
// (reconcile never ran because the SW crashed on load).
//
// Requires e2e/.env.e2e with GITMARKS_E2E_{TOKEN,OWNER,REPO} (a throwaway
// private repo + a fine-grained PAT with Contents: read/write). Skips without.

const TOKEN = process.env.GITMARKS_E2E_TOKEN;
const OWNER = process.env.GITMARKS_E2E_OWNER;
const REPO = process.env.GITMARKS_E2E_REPO;
const BRANCH = "main";

interface BookmarksFile {
  bookmarks: Array<{ url: string; title: string }>;
}

async function readRepoBookmarks(): Promise<BookmarksFile | null> {
  const res = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/bookmarks.json?ref=${BRANCH}`,
    {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub read failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { content: string };
  const decoded = Buffer.from(json.content, "base64").toString("utf8");
  return JSON.parse(decoded) as BookmarksFile;
}

test.describe("reconcile round-trip (real GitHub)", () => {
  test.skip(!TOKEN || !OWNER || !REPO, "no e2e credentials (e2e/.env.e2e) — skipping live GitHub test");

  test("completing setup pushes an existing native bookmark to the repo", async ({ serviceWorker }) => {
    const uniqueUrl = `https://e2e.gitmarks.test/${Date.now()}`;

    // 1) A bookmark exists in the native tree before setup (onCreated can't push
    //    yet — no settings — so this only reaches the repo via reconcile).
    await serviceWorker.evaluate(
      (url) => chrome.bookmarks.create({ parentId: "1", title: "gitmarks e2e", url }),
      uniqueUrl,
    );

    // 2) Complete setup by writing settings. The SW's storage.onChanged handler
    //    fires reconcile, which uploads the local-only bookmark.
    await serviceWorker.evaluate(
      (settings) => chrome.storage.local.set({ "gitmarks:settings": settings }),
      { token: TOKEN!, owner: OWNER!, repo: REPO!, branch: BRANCH, stripTrackingParams: false },
    );

    // 3) The live SW should write bookmarks.json containing our URL.
    await expect
      .poll(
        async () => {
          const file = await readRepoBookmarks();
          return file?.bookmarks.map((b) => b.url) ?? [];
        },
        {
          timeout: 40_000,
          intervals: [1000, 2000, 3000],
          message: "reconcile never wrote the bookmark to the repo",
        },
      )
      .toContain(uniqueUrl);
  });
});
