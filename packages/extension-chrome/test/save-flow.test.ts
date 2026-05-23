import { describe, it, expect, vi } from "vitest";
import {
  GitHubClient,
  GitHubNotFoundError,
  GitHubAuthError,
  bookmarksFileSchema,
  type BookmarksFile,
} from "@gitmarks/core";
import { saveBookmark } from "../src/lib/save-flow.js";

const machineId = "ABCDE12F";
const nowIso = "2026-05-23T14:32:11Z";
const page = { url: "https://example.com/", title: "Example" };

function fakeClient(overrides: Partial<GitHubClient>): GitHubClient {
  return overrides as unknown as GitHubClient;
}

describe("saveBookmark", () => {
  it("calls update once and returns the new bookmark on the happy path", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update = vi.fn(async (_path: any, mutate: (f: BookmarksFile) => BookmarksFile) => {
      const next = mutate({
        version: 1,
        updated_at: "2026-05-01T00:00:00Z",
        bookmarks: [],
      });
      return { data: next, sha: "newsha", etag: '"e"' };
    }) as any;
    const client = fakeClient({ update });

    const result = await saveBookmark(client, page, machineId, nowIso);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.bookmark.url).toBe("https://example.com/");
    expect(result.bookmark.added_from).toBe("chrome@ABCDE12F");
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]![0]).toBe("bookmarks.json");
  });

  it("bootstraps an empty bookmarks.json on first save (404 path)", async () => {
    let updateCallCount = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update = vi.fn(async (_path: any, mutate: (f: BookmarksFile) => BookmarksFile) => {
      updateCallCount += 1;
      if (updateCallCount === 1) {
        throw new GitHubNotFoundError("bookmarks.json");
      }
      const next = mutate({
        version: 1,
        updated_at: "2026-05-01T00:00:00Z",
        bookmarks: [],
      });
      return { data: next, sha: "s2", etag: '"e2"' };
    }) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const write = vi.fn(async () => ({ sha: "s1", etag: '"e1"' })) as any;
    const client = fakeClient({ update, write });

    const result = await saveBookmark(client, page, machineId, nowIso);

    expect(result.ok).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [path, data]: [string, any] = write.mock.calls[0]!;
    expect(path).toBe("bookmarks.json");
    expect(() => bookmarksFileSchema.parse(data)).not.toThrow();
    expect((data as BookmarksFile).bookmarks).toEqual([]);
    expect(update).toHaveBeenCalledTimes(2);
  });

  it("returns {ok:false, kind:'auth'} on a GitHubAuthError", async () => {
    const update = vi.fn(async () => {
      throw new GitHubAuthError();
    });
    const client = fakeClient({ update });

    const result = await saveBookmark(client, page, machineId, nowIso);

    expect(result).toEqual({
      ok: false,
      kind: "auth",
      message: expect.any(String),
    });
  });

  it("returns {ok:false, kind:'unknown'} on a non-GitHub error", async () => {
    const update = vi.fn(async () => {
      throw new Error("boom");
    });
    const client = fakeClient({ update });

    const result = await saveBookmark(client, page, machineId, nowIso);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.kind).toBe("unknown");
  });
});
