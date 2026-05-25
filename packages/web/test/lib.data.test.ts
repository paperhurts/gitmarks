import { describe, it, expect } from "vitest";
import type { Bookmark, BookmarksFile } from "@gitmarks/core";
import { searchBookmarks, visibleBookmarks, allUsedTags, deletedBookmarks } from "../src/lib/data.js";

function mk(over: Partial<Bookmark> = {}): Bookmark {
  return {
    id: "01HXYZ8K7M9P3RQ2V5W6Z8B0C1",
    url: "https://example.com/article",
    title: "Article",
    folder: "",
    tags: [],
    added_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
    added_from: "chrome@minerva",
    deleted_at: null,
    notes: null,
    ...over,
  };
}

const file: BookmarksFile = {
  version: 1,
  updated_at: "2026-05-23T00:00:00Z",
  bookmarks: [
    mk({ id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CA", title: "Hacker News", url: "https://news.ycombinator.com/", tags: ["daily"] }),
    mk({ id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CB", title: "Lobsters", url: "https://lobste.rs/", tags: ["daily"] }),
    mk({ id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CC", title: "Tailwind Docs", url: "https://tailwindcss.com/docs", tags: ["reference"], notes: "color tokens here" }),
    mk({ id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CD", title: "Tombstone", url: "https://gone.example.com/", deleted_at: "2026-05-10T00:00:00Z" }),
  ],
};

describe("visibleBookmarks", () => {
  it("filters out tombstoned bookmarks", () => {
    expect(visibleBookmarks(file)).toHaveLength(3);
    expect(visibleBookmarks(file).map((b) => b.id)).not.toContain("01HXYZ8K7M9P3RQ2V5W6Z8B0CD");
  });
});

describe("searchBookmarks", () => {
  it("returns all visible bookmarks for an empty query", () => {
    expect(searchBookmarks(visibleBookmarks(file), "")).toHaveLength(3);
  });

  it("matches title case-insensitively", () => {
    expect(searchBookmarks(visibleBookmarks(file), "tailwind")).toHaveLength(1);
    expect(searchBookmarks(visibleBookmarks(file), "TAILWIND")).toHaveLength(1);
  });

  it("matches URL substring", () => {
    expect(searchBookmarks(visibleBookmarks(file), "lobste.rs")).toHaveLength(1);
  });

  it("matches tags", () => {
    expect(searchBookmarks(visibleBookmarks(file), "daily")).toHaveLength(2);
  });

  it("matches notes", () => {
    expect(searchBookmarks(visibleBookmarks(file), "color tokens")).toHaveLength(1);
  });

  it("returns empty array for no matches", () => {
    expect(searchBookmarks(visibleBookmarks(file), "unrelated-xyz")).toHaveLength(0);
  });

  it("trims whitespace from the query", () => {
    expect(searchBookmarks(visibleBookmarks(file), "   tailwind   ")).toHaveLength(1);
  });
});

describe("allUsedTags", () => {
  it("returns the set of tag names referenced by visible bookmarks", () => {
    expect(allUsedTags(visibleBookmarks(file))).toEqual(new Set(["daily", "reference"]));
  });

  it("returns an empty set when no bookmarks have tags", () => {
    expect(allUsedTags([])).toEqual(new Set());
  });
});

describe("deletedBookmarks", () => {
  const fileWithDeletes: BookmarksFile = {
    version: 1,
    updated_at: "2026-05-25T00:00:00Z",
    bookmarks: [
      mk({ id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CA", deleted_at: null }),
      mk({ id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CB", deleted_at: "2026-05-20T00:00:00Z" }),
      mk({ id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CC", deleted_at: "2026-03-01T00:00:00Z" }),
    ],
  };

  it("returns deleted bookmarks within the GC window", () => {
    const got = deletedBookmarks(fileWithDeletes, "2026-05-25T00:00:00Z", 30);
    expect(got.map((b) => b.id)).toEqual(["01HXYZ8K7M9P3RQ2V5W6Z8B0CB"]);
  });

  it("returns empty when all deletes are past the GC window", () => {
    const got = deletedBookmarks(fileWithDeletes, "2027-01-01T00:00:00Z", 30);
    expect(got).toEqual([]);
  });
});
