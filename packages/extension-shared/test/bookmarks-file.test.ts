import { describe, it, expect, vi } from "vitest";
import type { BookmarksFile, GitHubClient } from "@gitmarks/core";
import { GitHubAuthError, GitHubNotFoundError } from "@gitmarks/core";
import { updateBookmarksOrBootstrap, TOMBSTONE_TTL_DAYS } from "../src/lib/bookmarks-file.js";

function fakeClient(over: any): GitHubClient {
  return over as GitHubClient;
}

describe("updateBookmarksOrBootstrap", () => {
  it("re-throws non-404 errors without calling write", async () => {
    const update = vi.fn(async () => {
      throw new GitHubAuthError();
    });
    const write = vi.fn();
    const client = fakeClient({ update, write });

    await expect(
      updateBookmarksOrBootstrap(
        client,
        (c) => c,
        "msg",
        "machine",
        "2026-05-23T00:00:00Z",
      ),
    ).rejects.toBeInstanceOf(GitHubAuthError);

    expect(write).not.toHaveBeenCalled();
  });

  it("bootstraps with an empty file then retries on 404", async () => {
    let updateCalls = 0;
    const update = vi.fn(async (_p: string, mutate: any) => {
      updateCalls += 1;
      if (updateCalls === 1) throw new GitHubNotFoundError("bookmarks.json");
      const next = mutate({ version: 1, updated_at: "x", bookmarks: [] });
      return { data: next, sha: "s", etag: "" };
    });
    const write = vi.fn(async () => ({ sha: "s0", etag: "" }));
    const client = fakeClient({ update, write });

    await updateBookmarksOrBootstrap(
      client,
      (c) => c,
      "msg",
      "machine",
      "2026-05-23T00:00:00Z",
    );

    expect(write).toHaveBeenCalledTimes(1);
    const writeCall = write.mock.calls[0] as unknown as [string, BookmarksFile, string];
    expect(writeCall[0]).toBe("bookmarks.json");
    expect(writeCall[1].bookmarks).toEqual([]);
    expect(update).toHaveBeenCalledTimes(2);
  });
});

describe("tombstone GC on write", () => {
  const NOW = "2026-11-08T00:00:00Z";
  const entry = (id: string, deleted_at: string | null) => ({
    id, url: `https://x.example/${id}`, title: id, folder: "", tags: [],
    added_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    added_from: "chrome@AAAAAAAA", deleted_at, notes: null,
  });

  it("drops tombstones older than 30 days and keeps recent ones + live entries", async () => {
    expect(TOMBSTONE_TTL_DAYS).toBe(30);
    const current: BookmarksFile = {
      version: 1,
      updated_at: NOW,
      bookmarks: [
        entry("live", null),
        entry("old", "2026-10-01T00:00:00Z"),    // 38 days ago → dropped
        entry("recent", "2026-11-01T00:00:00Z"), // 7 days ago → kept
      ],
    };
    let written: BookmarksFile | null = null;
    const update = vi.fn(async (_p: string, mutate: any) => {
      written = mutate(current);
      return { data: written, sha: "s", etag: "" };
    });
    const added = entry("new", null);
    await updateBookmarksOrBootstrap(
      fakeClient({ update }),
      (c) => ({ ...c, bookmarks: [...c.bookmarks, added] }),
      "msg", "machine", NOW,
    );
    expect(written!.bookmarks.map((b) => b.id)).toEqual(["live", "recent", "new"]);
  });

  it("applies GC on every replay of the mutator (409-safe)", async () => {
    const current: BookmarksFile = {
      version: 1, updated_at: NOW, bookmarks: [entry("old", "2026-01-01T00:00:00Z")],
    };
    const results: BookmarksFile[] = [];
    const update = vi.fn(async (_p: string, mutate: any) => {
      results.push(mutate(current), mutate(current));
      return { data: results[1], sha: "s", etag: "" };
    });
    await updateBookmarksOrBootstrap(fakeClient({ update }), (c) => c, "msg", "machine", NOW);
    expect(results.every((r) => r.bookmarks.length === 0)).toBe(true);
    expect(current.bookmarks).toHaveLength(1); // input not mutated
  });
});

