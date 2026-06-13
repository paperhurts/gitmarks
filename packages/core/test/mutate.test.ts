import { describe, it, expect } from "vitest";
import type { BookmarksFile, Bookmark } from "../src/schema/bookmarks.js";
import {
  addBookmark,
  addBookmarks,
  updateBookmark,
  softDeleteBookmark,
  gcTombstones,
  restoreBookmark,
  updateBookmarks,
} from "../src/mutate.js";

function mkBookmark(overrides: Partial<Bookmark> = {}): Bookmark {
  return {
    id: "01HXYZ8K7M9P3RQ2V5W6Z8B0C1",
    url: "https://example.com/",
    title: "Example",
    folder: "",
    tags: [],
    added_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
    added_from: "chrome@minerva",
    deleted_at: null,
    notes: null,
    ...overrides,
  };
}

function mkFile(bookmarks: Bookmark[] = []): BookmarksFile {
  return {
    version: 1,
    updated_at: "2026-05-01T00:00:00Z",
    bookmarks,
  };
}

describe("addBookmark", () => {
  it("appends to bookmarks and bumps file updated_at", () => {
    const file = mkFile();
    const bm = mkBookmark();
    const out = addBookmark(file, bm, "2026-05-23T00:00:00Z");

    expect(out.bookmarks).toEqual([bm]);
    expect(out.updated_at).toBe("2026-05-23T00:00:00Z");
    expect(out).not.toBe(file);
    expect(file.bookmarks).toEqual([]);
  });
});

describe("addBookmarks", () => {
  it("appends many and bumps updated_at", () => {
    const file = mkFile();
    const a = mkBookmark({ id: "a", url: "https://a.com/" });
    const b = mkBookmark({ id: "b", url: "https://b.com/" });
    const out = addBookmarks(file, [a, b], "2026-05-23T00:00:00Z");

    expect(out.bookmarks).toEqual([a, b]);
    expect(out.updated_at).toBe("2026-05-23T00:00:00Z");
    expect(file.bookmarks).toEqual([]); // input not mutated
  });

  it("skips candidates whose URL already exists (active)", () => {
    const existing = mkBookmark({ id: "x", url: "https://a.com/" });
    const file = mkFile([existing]);
    const dup = mkBookmark({ id: "a", url: "https://a.com/" });
    const fresh = mkBookmark({ id: "b", url: "https://b.com/" });

    const out = addBookmarks(file, [dup, fresh], "2026-05-23T00:00:00Z");

    expect(out.bookmarks.map((b) => b.id)).toEqual(["x", "b"]);
  });

  it("de-dupes within the incoming batch (first wins)", () => {
    const first = mkBookmark({ id: "1", url: "https://a.com/" });
    const second = mkBookmark({ id: "2", url: "https://a.com/" });
    const out = addBookmarks(mkFile(), [first, second], "2026-05-23T00:00:00Z");

    expect(out.bookmarks.map((b) => b.id)).toEqual(["1"]);
  });

  it("does NOT treat a tombstoned URL as a duplicate (allows re-save)", () => {
    const deleted = mkBookmark({
      id: "old",
      url: "https://a.com/",
      deleted_at: "2026-05-02T00:00:00Z",
    });
    const file = mkFile([deleted]);
    const fresh = mkBookmark({ id: "new", url: "https://a.com/" });

    const out = addBookmarks(file, [fresh], "2026-05-23T00:00:00Z");

    expect(out.bookmarks.map((b) => b.id)).toEqual(["old", "new"]);
  });

  it("bumps updated_at but appends nothing when all are duplicates", () => {
    const existing = mkBookmark({ url: "https://a.com/" });
    const file = mkFile([existing]);
    const dup = mkBookmark({ id: "dup", url: "https://a.com/" });

    const out = addBookmarks(file, [dup], "2026-05-23T00:00:00Z");

    expect(out.bookmarks).toEqual([existing]);
    expect(out.updated_at).toBe("2026-05-23T00:00:00Z");
  });
});

describe("updateBookmark", () => {
  it("applies a partial patch and sets updated_at", () => {
    const bm = mkBookmark({ title: "old" });
    const file = mkFile([bm]);
    const out = updateBookmark(
      file,
      bm.id,
      { title: "new", tags: ["x"] },
      "2026-05-23T01:00:00Z",
    );

    expect(out.bookmarks[0]!.title).toBe("new");
    expect(out.bookmarks[0]!.tags).toEqual(["x"]);
    expect(out.bookmarks[0]!.updated_at).toBe("2026-05-23T01:00:00Z");
    expect(out.updated_at).toBe("2026-05-23T01:00:00Z");
    expect(file.bookmarks[0]!.title).toBe("old");
  });

  it("throws if the bookmark id is not found", () => {
    expect(() =>
      updateBookmark(mkFile(), "01HXYZ8K7M9P3RQ2V5W6Z8B0C1", { title: "x" }, "now"),
    ).toThrow(/not found/);
  });
});

describe("softDeleteBookmark", () => {
  it("sets deleted_at and updated_at", () => {
    const bm = mkBookmark();
    const file = mkFile([bm]);
    const out = softDeleteBookmark(file, bm.id, "2026-05-23T02:00:00Z");

    expect(out.bookmarks[0]!.deleted_at).toBe("2026-05-23T02:00:00Z");
    expect(out.bookmarks[0]!.updated_at).toBe("2026-05-23T02:00:00Z");
    expect(file.bookmarks[0]!.deleted_at).toBeNull();
  });
});

describe("gcTombstones", () => {
  it("removes bookmarks soft-deleted longer than the threshold", () => {
    const old = mkBookmark({
      id: "01HXYZ8K7M9P3RQ2V5W6Z8B0C1",
      deleted_at: "2026-01-01T00:00:00Z",
    });
    const recent = mkBookmark({
      id: "01HXYZ8K7M9P3RQ2V5W6Z8B0C2",
      deleted_at: "2026-05-20T00:00:00Z",
    });
    const live = mkBookmark({ id: "01HXYZ8K7M9P3RQ2V5W6Z8B0C3" });
    const file = mkFile([old, recent, live]);

    const out = gcTombstones(file, 30, "2026-05-23T00:00:00Z");

    expect(out.bookmarks.map((b) => b.id)).toEqual([recent.id, live.id]);
    expect(out.updated_at).toBe("2026-05-23T00:00:00Z");
  });

  it("does not modify the file if nothing is past the threshold", () => {
    const live = mkBookmark();
    const file = mkFile([live]);
    const out = gcTombstones(file, 30, "2026-05-23T00:00:00Z");
    expect(out.bookmarks).toEqual([live]);
  });
});

describe("updateBookmarks (bulk)", () => {
  it("applies a patch to every listed id and stamps updated_at", () => {
    const file = mkFile([
      mkBookmark({ id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CA" }),
      mkBookmark({ id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CB" }),
      mkBookmark({ id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CC" }),
    ]);
    const next = updateBookmarks(
      file,
      [
        { id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CA", patch: { folder: "Archive" } },
        { id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CC", patch: { tags: ["x"] } },
      ],
      "2026-05-25T00:00:00Z",
    );
    expect(next.bookmarks[0]!.folder).toBe("Archive");
    expect(next.bookmarks[0]!.updated_at).toBe("2026-05-25T00:00:00Z");
    expect(next.bookmarks[1]!.folder).toBe(file.bookmarks[1]!.folder);
    expect(next.bookmarks[2]!.tags).toEqual(["x"]);
    expect(next.updated_at).toBe("2026-05-25T00:00:00Z");
  });

  it("throws when any id is missing", () => {
    const file = mkFile([mkBookmark({ id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CA" })]);
    expect(() =>
      updateBookmarks(file, [{ id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CZ", patch: {} }], "2026-05-25T00:00:00Z"),
    ).toThrow(/not found/);
  });

  it("no-ops on empty patch list but stamps updated_at", () => {
    const file = mkFile([mkBookmark({ id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CA" })]);
    const next = updateBookmarks(file, [], "2026-05-25T00:00:00Z");
    expect(next.updated_at).toBe("2026-05-25T00:00:00Z");
    expect(next.bookmarks).toEqual(file.bookmarks);
  });

  it("does not mutate the input", () => {
    const file = mkFile([mkBookmark({ id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CA", folder: "" })]);
    updateBookmarks(file, [{ id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CA", patch: { folder: "X" } }], "2026-05-25T00:00:00Z");
    expect(file.bookmarks[0]!.folder).toBe("");
  });
});

describe("restoreBookmark", () => {
  it("clears deleted_at and updates updated_at", () => {
    const file = mkFile([
      mkBookmark({ id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CA", deleted_at: "2026-04-01T00:00:00Z" }),
    ]);
    const next = restoreBookmark(file, "01HXYZ8K7M9P3RQ2V5W6Z8B0CA", "2026-05-25T00:00:00Z");
    expect(next.bookmarks[0]!.deleted_at).toBeNull();
    expect(next.bookmarks[0]!.updated_at).toBe("2026-05-25T00:00:00Z");
  });

  it("throws when the id is missing", () => {
    const file = mkFile([]);
    expect(() => restoreBookmark(file, "01HXYZ8K7M9P3RQ2V5W6Z8B0CZ", "2026-05-25T00:00:00Z")).toThrow(/not found/);
  });
});
