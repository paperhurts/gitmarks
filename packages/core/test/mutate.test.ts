import { describe, it, expect } from "vitest";
import type { BookmarksFile, Bookmark } from "../src/schema/bookmarks.js";
import {
  addBookmark,
  updateBookmark,
  softDeleteBookmark,
  gcTombstones,
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
