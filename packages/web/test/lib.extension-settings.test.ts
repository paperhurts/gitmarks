import { describe, it, expect, vi } from "vitest";
import {
  EXTENSION_SETTINGS_KEY,
  isExtensionPage,
  loadExtensionSettings,
  openExtensionOptions,
  type PageEnv,
} from "../src/lib/settings.js";

function env(protocol: string, stored: Record<string, unknown> = {}): PageEnv & { openOptionsPage: ReturnType<typeof vi.fn> } {
  const openOptionsPage = vi.fn();
  return {
    protocol,
    api: {
      storage: { local: { get: vi.fn(async (k: string) => (k in stored ? { [k]: stored[k] } : {})) } },
      runtime: { openOptionsPage },
    },
    openOptionsPage,
  };
}

const extSettings = {
  token: "ghp_x",
  owner: "kid",
  repo: "bookmarks",
  branch: "main",
  stripTrackingParams: true,
};

describe("isExtensionPage", () => {
  it.each(["chrome-extension:", "moz-extension:", "safari-web-extension:"])("is true for %s with storage", (p) => {
    expect(isExtensionPage(env(p))).toBe(true);
  });

  it("is false on the public site even if an extension API is present", () => {
    expect(isExtensionPage(env("https:"))).toBe(false);
  });

  it("is false on an extension protocol without storage", () => {
    expect(isExtensionPage({ protocol: "chrome-extension:", api: undefined })).toBe(false);
  });
});

describe("loadExtensionSettings", () => {
  it("reads the extension's settings and drops extension-only fields", async () => {
    const e = env("chrome-extension:", { [EXTENSION_SETTINGS_KEY]: extSettings });
    expect(await loadExtensionSettings(e)).toEqual({
      token: "ghp_x",
      owner: "kid",
      repo: "bookmarks",
      branch: "main",
    });
  });

  it("returns null when the extension isn't set up or settings are malformed", async () => {
    expect(await loadExtensionSettings(env("chrome-extension:"))).toBeNull();
    expect(
      await loadExtensionSettings(env("chrome-extension:", { [EXTENSION_SETTINGS_KEY]: { token: "" } })),
    ).toBeNull();
  });

  it("never touches extension storage from the public site", async () => {
    const e = env("https:", { [EXTENSION_SETTINGS_KEY]: extSettings });
    expect(await loadExtensionSettings(e)).toBeNull();
    expect(e.api!.storage!.local!.get).not.toHaveBeenCalled();
  });
});

describe("openExtensionOptions", () => {
  it("opens the extension's options page", () => {
    const e = env("moz-extension:");
    openExtensionOptions(e);
    expect(e.openOptionsPage).toHaveBeenCalledTimes(1);
  });
});
