import { describe, it, expect } from "vitest";
import type { BookmarksFile, Bookmark } from "../src/schema/bookmarks.js";
import {
  addBookmark,
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
