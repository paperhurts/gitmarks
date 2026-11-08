import { test, expect } from "./fixtures.js";

// The web UI ships inside the extension at web/index.html so it can read the
// extension's own settings (one setup instead of two). These specs catch a
// build that forgot to bundle it, or a bundled page that can't run under the
// extension CSP or can't see extension storage.

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64");

test.describe("bundled web UI", () => {
  test("before setup: points to extension settings, never shows the PAT form", async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/web/index.html`);
    await expect(page.getByTestId("extension-setup-notice")).toBeVisible();
    await expect(page.getByLabel("token")).toHaveCount(0);

    const opened = context.waitForEvent("page");
    await page.getByRole("button", { name: /open gitmarks settings/i }).click();
    expect(new URL((await opened).url()).pathname).toBe("/src/options.html");
  });

  test("after setup in the extension: lists bookmarks with no second setup", async ({
    context,
    extensionId,
    serviceWorker,
  }) => {
    await context.route("https://api.github.com/**", (route) => {
      if (route.request().url().includes("/contents/bookmarks.json")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: { etag: '"s1"' },
          body: JSON.stringify({
            sha: "s1",
            encoding: "base64",
            content: b64({
              version: 1,
              updated_at: "2026-01-01T00:00:00Z",
              bookmarks: [
                {
                  id: "01J0000000000000000000000A",
                  url: "https://example.com/",
                  title: "Bundled UI bookmark",
                  folder: "",
                  tags: [],
                  added_at: "2026-01-01T00:00:00Z",
                  updated_at: "2026-01-01T00:00:00Z",
                  added_from: "chrome@AAAAAAAA",
                  deleted_at: null,
                  notes: null,
                },
              ],
            }),
          }),
        });
      }
      return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
    });
    await serviceWorker.evaluate(async () => {
      await chrome.storage.local.set({
        "gitmarks:settings": {
          token: "ghp_e2e",
          owner: "e2e",
          repo: "bookmarks",
          branch: "main",
          stripTrackingParams: false,
        },
      });
    });

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/web/index.html`);
    await expect(page.getByText("Bundled UI bookmark")).toBeVisible({ timeout: 10_000 });
    // Sign out would wipe the extension's settings, so it's hidden here.
    await expect(page.getByRole("button", { name: /sign out/i })).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
  });
});
