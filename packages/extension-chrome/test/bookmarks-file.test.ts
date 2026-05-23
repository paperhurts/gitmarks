import { describe, it, expect, vi } from "vitest";
import type { BookmarksFile, GitHubClient } from "@gitmarks/core";
import { GitHubAuthError, GitHubNotFoundError } from "@gitmarks/core";
import { updateBookmarksOrBootstrap } from "../src/lib/bookmarks-file.js";

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
