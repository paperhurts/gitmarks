import { describe, it, expect } from "vitest";
import type { Bookmark, BookmarksFile } from "@gitmarks/core";
import { dedupeBookmarks, findDuplicates } from "../src/lib/dedupe.js";

const NOW = "2026-11-08T00:00:00Z";
const OLD = "2026-01-01T00:00:00Z";

function bm(over: Partial<Bookmark>): Bookmark {
  return {
    id: "x", url: "https://a.example/", title: "A", folder: "", tags: [],
    added_at: OLD, updated_at: OLD, added_from: "chrome@AAAAAAAA",
    deleted_at: null, notes: null, ...over,
  };
}
const file = (bookmarks: Bookmark[]): BookmarksFile => ({ version: 1, updated_at: OLD, bookmarks });

describe("findDuplicates", () => {
  it("counts URLs with copies and the extra entries, by normalized URL", () => {
    const f = file([
      bm({ id: "1", url: "https://a.example/p" }),
      bm({ id: "2", url: "https://a.example/p/" }),
      bm({ id: "3", url: "https://a.example/p#x" }),
      bm({ id: "4", url: "https://b.example/" }),
      bm({ id: "5", url: "https://b.example/" }),
      bm({ id: "6", url: "https://c.example/" }),
    ]);
    expect(findDuplicates(f)).toEqual({ urls: 2, extra: 3 });
  });

  it("ignores entries already in the trash", () => {
    const f = file([
      bm({ id: "1" }),
      bm({ id: "2", deleted_at: OLD }),
    ]);
    expect(findDuplicates(f)).toEqual({ urls: 0, extra: 0 });
  });
});

describe("dedupeBookmarks", () => {
  it("keeps the first entry, merges tags and notes into it, trashes the rest", () => {
    const f = file([
      bm({ id: "keep", tags: ["Work"] }),
      bm({ id: "d1", tags: ["work", "ai"], notes: "hello" }),
      bm({ id: "d2", tags: ["ai", "later"] }),
      bm({ id: "other", url: "https://other.example/" }),
    ]);
    const next = dedupeBookmarks(NOW)(f);
    const by = new Map(next.bookmarks.map((b) => [b.id, b]));
    expect(by.get("keep")).toMatchObject({ deleted_at: null, tags: ["Work", "ai", "later"], notes: "hello" });
    expect(by.get("d1")!.deleted_at).toBe(NOW);
    expect(by.get("d2")!.deleted_at).toBe(NOW);
    expect(by.get("other")!.deleted_at).toBeNull();
    expect(by.get("other")!.updated_at).toBe(OLD);
    expect(findDuplicates(next)).toEqual({ urls: 0, extra: 0 });
  });

  it("is a no-op on a file without duplicates", () => {
    const f = file([bm({ id: "1" }), bm({ id: "2", url: "https://b.example/" })]);
    expect(dedupeBookmarks(NOW)(f).bookmarks).toEqual(f.bookmarks);
  });

  // Real-world size from the pre-#84 duplication. No wall-clock assertion:
  // shared CI runners are too noisy for one (it flaked at 1.5s vs 1s).
  it("collapses a large file (18k entries, 483 URLs)", () => {
    const bookmarks: Bookmark[] = [];
    for (let i = 0; i < 18460; i++) {
      bookmarks.push(bm({ id: `id${i}`, url: `https://site${i % 483}.example/page` }));
    }
    const next = dedupeBookmarks(NOW)(file(bookmarks));
    expect(next.bookmarks.filter((b) => b.deleted_at == null)).toHaveLength(483);
  });
});
