import { describe, it, expect, beforeEach } from "vitest";
import { loadSettings, saveSettings, clearSettings, type Settings } from "../src/lib/settings.js";

const valid: Settings = {
  token: "ghp_fake_token",
  owner: "paperhurts",
  repo: "bookmarks",
  branch: "main",
};

describe("settings", () => {
  beforeEach(() => localStorage.clear());

  it("returns null when nothing is stored", () => {
    expect(loadSettings()).toBeNull();
  });

  it("round-trips a valid settings object", () => {
    saveSettings(valid);
    expect(loadSettings()).toEqual(valid);
  });

  it("returns null and discards garbage", () => {
    localStorage.setItem("gitmarks:web:settings", "{not json");
    expect(loadSettings()).toBeNull();
  });

  it("returns null on schema mismatch", () => {
    localStorage.setItem("gitmarks:web:settings", JSON.stringify({ token: 1 }));
    expect(loadSettings()).toBeNull();
  });

  it("clearSettings removes the entry", () => {
    saveSettings(valid);
    clearSettings();
    expect(loadSettings()).toBeNull();
  });

  it("rejects empty token / owner / repo at save time", () => {
    expect(() => saveSettings({ ...valid, token: "" })).toThrow();
    expect(() => saveSettings({ ...valid, owner: "" })).toThrow();
    expect(() => saveSettings({ ...valid, repo: "" })).toThrow();
  });

  it("accepts custom branch and defaults are not applied silently", () => {
    saveSettings({ ...valid, branch: "develop" });
    expect(loadSettings()?.branch).toBe("develop");
  });
});
