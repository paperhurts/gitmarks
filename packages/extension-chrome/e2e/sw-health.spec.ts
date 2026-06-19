import { test, expect } from "./fixtures";

// Regression guard for #57: the background service worker used to throw at load
// (ulid's module-level crypto detection), so SW registration failed and the
// whole background — reconcile, native-tree listeners, the poll alarm — never
// ran. The popup still worked, so unit tests + popup e2e all passed while the
// extension was effectively dead in a real browser.
//
// This asserts the SW actually initialized: it must have evaluated far enough to
// register the poll alarm (background.ts creates it after wiring listeners). A
// SW that crashes on import never reaches that line.
test.describe("service worker health", () => {
  test("registers and runs background init (poll alarm created)", async ({ serviceWorker }) => {
    // Sanity: the worker is alive and can execute code at all.
    const alive = await serviceWorker.evaluate(() => 1 + 1);
    expect(alive).toBe(2);

    // The real check: background.ts ran to completion, so the poll alarm exists.
    await expect
      .poll(
        () =>
          serviceWorker.evaluate(async () => {
            const alarms = await chrome.alarms.getAll();
            return alarms.map((a) => a.name);
          }),
        { timeout: 10_000, message: "background.ts never created gitmarks:poll — SW likely crashed on load" },
      )
      .toContain("gitmarks:poll");
  });
});
