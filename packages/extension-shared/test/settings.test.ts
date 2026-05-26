import { describe, it, expect } from "vitest";
import { loadSettings, saveSettings, clearSettings, SettingsCorruptError } from "../src/lib/settings.js";

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
      stripTrackingParams: false,
    };
    await saveSettings(s);
    expect(await loadSettings()).toEqual(s);
  });

  it("defaults stripTrackingParams to false when omitted in stored data", async () => {
    // Legacy stored settings without the field should still parse via Zod's default.
    await browser.storage.local.set({
      "gitmarks:settings": {
        token: "t",
        owner: "alice",
        repo: "bookmarks",
        branch: "main",
      },
    });
    const loaded = await loadSettings();
    expect(loaded?.stripTrackingParams).toBe(false);
  });

  it("throws SettingsCorruptError when the stored value is malformed", async () => {
    await browser.storage.local.set({ "gitmarks:settings": { not: "valid" } });
    await expect(loadSettings()).rejects.toThrow(/invalid/);
  });

  it("clearSettings removes the stored value", async () => {
    await saveSettings({
      token: "t",
      owner: "o",
      repo: "r",
      branch: "main",
      stripTrackingParams: false,
    });
    await clearSettings();
    expect(await loadSettings()).toBeNull();
  });

  it("rejects an empty token at save time", async () => {
    await expect(
      saveSettings({ token: "", owner: "o", repo: "r", branch: "main", stripTrackingParams: false }),
    ).rejects.toThrow();
  });

  it("rejects an owner/repo containing slashes", async () => {
    await expect(
      saveSettings({
        token: "t",
        owner: "a/b",
        repo: "r",
        branch: "main",
        stripTrackingParams: false,
      }),
    ).rejects.toThrow();
  });
});
