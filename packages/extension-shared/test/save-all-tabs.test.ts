import { describe, it, expect, vi } from "vitest";
import { GitHubClient, type BookmarksFile, type Bookmark } from "@gitmarks/core";
import { saveAllTabs, type PageInfo } from "../src/lib/save-flow.js";

const machineId = "ABCDE12F";
const nowIso = "2026-06-13T12:00:00Z";

function fakeClient(overrides: Partial<GitHubClient>): GitHubClient {
  return overrides as unknown as GitHubClient;
}

/** An update mock that runs the mutator against `existing` and records the committed file. */
function clientWith(existing: Bookmark[] = []) {
  const committed: { file?: BookmarksFile } = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update = vi.fn(async (_path: any, mutate: (f: BookmarksFile) => BookmarksFile) => {
    const next = mutate({ version: 1, updated_at: "2026-05-01T00:00:00Z", bookmarks: existing });
    committed.file = next;
    return { data: next, sha: "newsha", etag: '"e"' };
  }) as any;
  return { client: fakeClient({ update }), update, committed };
}

function mkExisting(url: string, deleted = false): Bookmark {
  return {
    id: url,
    url,
    title: url,
    folder: "",
    tags: [],
    added_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
    added_from: "chrome@old",
    deleted_at: deleted ? "2026-05-02T00:00:00Z" : null,
    notes: null,
  };
}

const pages = (...urls: string[]): PageInfo[] => urls.map((u) => ({ url: u, title: u }));

describe("saveAllTabs", () => {
  it("saves every page in one batched update and reports counts", async () => {
    const { client, update, committed } = clientWith();
    const result = await saveAllTabs(
      client,
      pages("https://a.com/", "https://b.com/"),
      machineId,
      nowIso,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result).toMatchObject({ saved: 2, skippedUnsafe: 0, skippedDuplicate: 0, total: 2 });
    expect(update).toHaveBeenCalledTimes(1);
    expect(committed.file!.bookmarks.map((b) => b.url)).toEqual([
      "https://a.com/",
      "https://b.com/",
    ]);
  });

  it("skips unsafe-scheme URLs (counted as skippedUnsafe) and never builds them", async () => {
    const { client, committed } = clientWith();
    const result = await saveAllTabs(
      client,
      pages("https://a.com/", "javascript:alert(1)", "data:text/html,x"),
      machineId,
      nowIso,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result).toMatchObject({ saved: 1, skippedUnsafe: 2, skippedDuplicate: 0, total: 3 });
    expect(committed.file!.bookmarks.map((b) => b.url)).toEqual(["https://a.com/"]);
  });

  it("de-dupes against existing active bookmarks and within the batch", async () => {
    const { client, committed } = clientWith([mkExisting("https://a.com/")]);
    const result = await saveAllTabs(
      client,
      pages("https://a.com/", "https://b.com/", "https://b.com/"),
      machineId,
      nowIso,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    // a.com already exists; b.com appears twice -> one saved, two duplicates skipped.
    expect(result).toMatchObject({ saved: 1, skippedUnsafe: 0, skippedDuplicate: 2, total: 3 });
    expect(committed.file!.bookmarks.map((b) => b.url)).toEqual([
      "https://a.com/",
      "https://b.com/",
    ]);
  });

  it("places saved tabs in the given folder", async () => {
    const { client, committed } = clientWith();
    await saveAllTabs(client, pages("https://a.com/"), machineId, nowIso, {
      folder: "Session 2026-06-13",
    });

    expect(committed.file!.bookmarks[0]!.folder).toBe("Session 2026-06-13");
  });

  it("does not call update when there are no safe candidates", async () => {
    const { client, update } = clientWith();
    const result = await saveAllTabs(client, pages("javascript:void(0)"), machineId, nowIso);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result).toMatchObject({ saved: 0, skippedUnsafe: 1, skippedDuplicate: 0, total: 1 });
    expect(update).not.toHaveBeenCalled();
  });

  it("classifies an auth failure as a SaveFailure", async () => {
    const { GitHubAuthError } = await import("@gitmarks/core");
    const update = vi.fn(async () => {
      throw new GitHubAuthError("bad token");
    }) as unknown as GitHubClient["update"];
    const result = await saveAllTabs(
      fakeClient({ update }),
      pages("https://a.com/"),
      machineId,
      nowIso,
    );

    expect(result).toEqual({ ok: false, kind: "auth", message: "bad token" });
  });
});
