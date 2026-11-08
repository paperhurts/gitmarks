import { describe, it, expect } from "vitest";
import type { Bookmark } from "@gitmarks/core";
import { knownTags, suggestTags } from "../src/lib/tag-suggest.js";

let n = 0;
function bm(url: string, tags: string[], deleted = false): Bookmark {
  n++;
  return {
    id: `01J00000000000000000000${String(n).padStart(3, "0")}`,
    url,
    title: "t",
    folder: "",
    tags,
    added_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    added_from: "chrome@AAAA",
    deleted_at: deleted ? "2026-01-02T00:00:00Z" : null,
    notes: null,
  };
}

describe("knownTags", () => {
  it("unions tags.json keys with used tags, tags.json spelling first, ignoring tombstones", () => {
    const tagsFile = { version: 1 as const, tags: { Rust: { color: "#22d3ee", description: null } } };
    const out = knownTags(
      [bm("https://a.com", ["rust", "dev"]), bm("https://b.com", ["gone"], true)],
      tagsFile,
    );
    expect(out).toEqual(["Rust", "dev"]);
  });

  it("works without a tags.json", () => {
    expect(knownTags([bm("https://a.com", ["x"])], null)).toEqual(["x"]);
  });
});

describe("suggestTags", () => {
  const bookmarks = [
    bm("https://github.com/a", ["dev"]),
    bm("https://www.github.com/b", ["dev", "oss"]),
    bm("https://news.site/x", ["reading"]),
    bm("https://news.site/y", ["reading"]),
    bm("https://news.site/z", ["reading"]),
    bm("https://blog.example/rust", ["rust"]),
  ];
  const known = ["dev", "oss", "reading", "rust", "unused"];

  it("ranks same-domain tags first (www-insensitive)", () => {
    const out = suggestTags({ bookmarks, known, url: "https://github.com/new", title: "x", selected: [] });
    expect(out.slice(0, 2)).toEqual(["dev", "oss"]);
  });

  it("boosts tags whose words appear in the title", () => {
    const out = suggestTags({ bookmarks, known, url: "https://other.com", title: "Learning Rust ownership", selected: [] });
    expect(out[0]).toBe("rust");
  });

  it("falls back to popularity and excludes already-selected tags", () => {
    const out = suggestTags({ bookmarks, known, url: "https://other.com", title: "", selected: ["READING"] });
    expect(out).not.toContain("reading");
    expect(out[0]).toBe("dev");
  });

  it("filters by query with prefix matches first", () => {
    const out = suggestTags({
      bookmarks,
      known: ["undo", "fun", "unused"],
      url: "https://x.com",
      title: "",
      selected: [],
      query: "un",
    });
    expect(out).toEqual(["undo", "unused", "fun"]);
  });

  it("respects limit", () => {
    expect(suggestTags({ bookmarks, known, url: "https://x.com", title: "", selected: [], limit: 2 })).toHaveLength(2);
  });
});
