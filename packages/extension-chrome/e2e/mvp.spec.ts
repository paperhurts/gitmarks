import { test, expect } from "./fixtures.js";
import { installGitHubMock, decodeStoredBookmarks } from "./github-mock.js";

test.describe("MVP smoke", () => {
  test("popup before setup shows 'Set up gitmarks'", async ({ context, extensionId }) => {
    await installGitHubMock(context);
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/src/popup.html`);
    await expect(page.getByRole("button", { name: "Set up gitmarks" })).toBeVisible();
  });

  // SKIPPED: requires the popup's getActiveTab fallback that scanned all tabs
  // (which needed the broader 'tabs' manifest permission). Permission was dropped
  // (issue #3) — production code now relies on the activeTab permission granted
  // on toolbar-icon click. Playwright opens popup.html as a normal tab, which
  // doesn't qualify as the action gesture, so chrome.tabs.query({active,currentWindow})
  // returns the popup tab itself. Same family as the Playwright SW-dispatch gap
  // (issue #5). The popup save flow is covered by unit tests in test/save-flow.test.ts.
  test.skip("options page saves settings and popup switches to save view", async ({ context, extensionId }) => {
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
    await expect(options.locator("#status")).toContainText("valid PAT");
  });

  // SKIPPED: same Playwright/activeTab gap as the "popup switches to save view"
  // test above (issue #3, #5). Save-flow unit coverage lives in
  // test/save-flow.test.ts and test/bookmarks-file.test.ts; the GitHub-write
  // round-trip is verified by sync.spec.ts which exercises the algorithm
  // inline in the service-worker context.
  test.skip("save flow writes to mocked GitHub", async ({ context, extensionId }) => {
    // The popup calls the GitHub API directly (page context), so context.route()
    // interception is sufficient — no service worker fetch patching needed.
    const mock = await installGitHubMock(context);

    const options = await context.newPage();
    await options.goto(`chrome-extension://${extensionId}/src/options.html`);
    await options.locator("#token").fill("t");
    await options.locator("#owner").fill("alice");
    await options.locator("#repo").fill("marks");
    await options.locator("#save").click();
    await expect(options.locator("#status")).toHaveText("✓ saved");
    await options.close();

    const target = await context.newPage();
    await target.goto("https://example.com/article");
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/src/popup.html`);
    await popup.getByRole("button", { name: "Save this page" }).click();
    await expect(popup.locator("#status")).toHaveText("✓ saved", { timeout: 10_000 });

    const stored = decodeStoredBookmarks(mock.state) as {
      bookmarks: Array<{ url: string; title: string }>;
    };
    expect(stored.bookmarks.length).toBe(1);
    expect(stored.bookmarks[0]!.url).toBe("https://example.com/article");
  });
});
