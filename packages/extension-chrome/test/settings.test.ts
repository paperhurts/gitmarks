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
