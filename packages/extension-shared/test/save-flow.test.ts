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

describe("saveBookmark — tags and URL dedupe", () => {
  const existing = {
    id: "01J0000000000000000000000A",
    url: "https://example.com/",
    title: "Old title",
    folder: "Research",
    tags: ["Rust", "dev"],
    added_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    added_from: "chrome@OTHER",
    deleted_at: null,
    notes: "n",
  };

  function capturingClient(initial: BookmarksFile) {
    let committed: BookmarksFile | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update = vi.fn(async (_p: any, mutate: (f: BookmarksFile) => BookmarksFile) => {
      committed = mutate(initial);
      return { data: committed, sha: "s", etag: "" };
    }) as any;
    return { client: fakeClient({ update }), committed: () => committed!, update };
  }

  it("cleans and attaches tags on a new bookmark", async () => {
    const { client, committed } = capturingClient({ version: 1, updated_at: "x", bookmarks: [] });
    const result = await saveBookmark(client, page, machineId, nowIso, {
      tags: ["  dev ", "Dev", "", "a,b"],
    });
    expect(result.ok && result.outcome).toBe("added");
    expect(committed().bookmarks[0]!.tags).toEqual(["dev", "a b"]);
    expect(() => bookmarksFileSchema.parse(committed())).not.toThrow();
  });

  it("updates an existing active bookmark instead of duplicating, unioning tags by default", async () => {
    const { client, committed } = capturingClient({ version: 1, updated_at: "x", bookmarks: [existing] });
    const result = await saveBookmark(client, page, machineId, nowIso, { tags: ["rust", "docs"] });
    if (!result.ok) throw new Error("expected ok");
    expect(result.outcome).toBe("updated");
    expect(committed().bookmarks).toHaveLength(1);
    const bm = committed().bookmarks[0]!;
    expect(bm.tags).toEqual(["Rust", "dev", "docs"]);
    // Only tags change — title/folder/notes stay as the user left them.
    expect(bm.title).toBe("Old title");
    expect(bm.folder).toBe("Research");
    expect(bm.notes).toBe("n");
    expect(bm.updated_at).toBe(nowIso);
    expect(result.bookmark.id).toBe(existing.id);
  });

  it("replaceTags sets the exact tag list (allows removal)", async () => {
    const { client, committed } = capturingClient({ version: 1, updated_at: "x", bookmarks: [existing] });
    await saveBookmark(client, page, machineId, nowIso, { tags: ["dev"], replaceTags: true });
    expect(committed().bookmarks[0]!.tags).toEqual(["dev"]);
  });

  it("does not treat a tombstoned bookmark as existing", async () => {
    const dead = { ...existing, deleted_at: "2026-02-01T00:00:00Z" };
    const { client, committed } = capturingClient({ version: 1, updated_at: "x", bookmarks: [dead] });
    const result = await saveBookmark(client, page, machineId, nowIso, { tags: ["x"] });
    expect(result.ok && result.outcome).toBe("added");
    expect(committed().bookmarks).toHaveLength(2);
  });

  it("decides add-vs-update from the replayed state on a 409 retry", async () => {
    // First attempt sees no bookmark; the retry sees one added concurrently.
    let finalState: BookmarksFile | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update = vi.fn(async (_p: any, mutate: (f: BookmarksFile) => BookmarksFile) => {
      mutate({ version: 1, updated_at: "x", bookmarks: [] });
      finalState = mutate({ version: 1, updated_at: "x", bookmarks: [existing] });
      return { data: finalState, sha: "s", etag: "" };
    }) as any;
    const result = await saveBookmark(fakeClient({ update }), page, machineId, nowIso, { tags: ["new"] });
    if (!result.ok) throw new Error("expected ok");
    expect(result.outcome).toBe("updated");
    expect(finalState!.bookmarks).toHaveLength(1);
    expect(result.bookmark.tags).toEqual(["Rust", "dev", "new"]);
  });
});
