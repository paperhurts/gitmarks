import { describe, it, expect, vi } from "vitest";
import { makeClient, validateConnection } from "../src/lib/client.js";
import type { Settings } from "../src/lib/settings.js";

const baseSettings: Settings = {
  token: "ghp_fake",
  owner: "paperhurts",
  repo: "bookmarks",
  branch: "main",
};

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", etag: '"abc"', ...(init.headers ?? {}) },
  });
}

function contentsResponse(payload: unknown): Response {
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  return jsonResponse({ content, sha: "deadbeef", encoding: "base64" });
}

describe("makeClient", () => {
  it("builds a GitHubClient with the given settings and a custom fetch", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(contentsResponse({ version: 1, updated_at: "2026-05-23T00:00:00Z", bookmarks: [] }));
    const client = makeClient(baseSettings, fetchImpl);
    const result = await client.read("bookmarks.json");
    expect(result.data).toEqual({ version: 1, updated_at: "2026-05-23T00:00:00Z", bookmarks: [] });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});

describe("validateConnection", () => {
  it("returns ok-with-files when both files are present", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(contentsResponse({ version: 1, updated_at: "2026-05-23T00:00:00Z", bookmarks: [] }))
      .mockResolvedValueOnce(contentsResponse({ version: 1, tags: {} }));
    expect(await validateConnection(baseSettings, fetchImpl)).toEqual({ status: "ok-with-files" });
  });

  it("returns ok-no-files when bookmarks.json is 404 but repo exists", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ message: "Not Found" }, { status: 404 }))
      .mockResolvedValueOnce(jsonResponse({ id: 1, name: "bookmarks" }));
    expect(await validateConnection(baseSettings, fetchImpl)).toEqual({ status: "ok-no-files" });
  });

  it("returns auth-failed on 401", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ message: "Bad credentials" }, { status: 401 }));
    expect(await validateConnection(baseSettings, fetchImpl)).toEqual({ status: "auth-failed" });
  });

  it("returns repo-not-found when both bookmarks.json and repo lookup 404", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ message: "Not Found" }, { status: 404 }));
    expect(await validateConnection(baseSettings, fetchImpl)).toEqual({ status: "repo-not-found" });
  });

  it("returns network-error on a non-HTTP fetch failure", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Network down"));
    const result = await validateConnection(baseSettings, fetchImpl);
    expect(result.status).toBe("network-error");
  });
});
