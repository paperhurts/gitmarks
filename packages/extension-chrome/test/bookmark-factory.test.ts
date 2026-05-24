import { describe, it, expect } from "vitest";
import { bookmarkSchema } from "@gitmarks/core";
import { buildBookmark } from "../src/lib/bookmark-factory.js";

describe("buildBookmark", () => {
  it("produces a schema-valid bookmark", () => {
    const bm = buildBookmark({
      url: "https://example.com/article/",
      title: "Example",
      machineId: "ABCDE12F",
      nowIso: "2026-05-23T14:32:11Z",
    });
    expect(() => bookmarkSchema.parse(bm)).not.toThrow();
  });

  it("normalizes the URL (strips trailing slash, drops non-hashbang fragments)", () => {
    const bm = buildBookmark({
      url: "https://example.com/article/#section",
      title: "Example",
      machineId: "ABCDE12F",
      nowIso: "2026-05-23T14:32:11Z",
    });
    expect(bm.url).toBe("https://example.com/article");
  });

  it("sets added_from = chrome@<machineId>", () => {
    const bm = buildBookmark({
      url: "https://example.com/",
      title: "x",
      machineId: "ABCDE12F",
      nowIso: "2026-05-23T14:32:11Z",
    });
    expect(bm.added_from).toBe("chrome@ABCDE12F");
  });

  it("sets folder to empty and tags to empty array", () => {
    const bm = buildBookmark({
      url: "https://example.com/",
      title: "x",
      machineId: "ABCDE12F",
      nowIso: "2026-05-23T14:32:11Z",
    });
    expect(bm.folder).toBe("");
    expect(bm.tags).toEqual([]);
  });

  it("sets added_at == updated_at == nowIso", () => {
    const bm = buildBookmark({
      url: "https://example.com/",
      title: "x",
      machineId: "ABCDE12F",
      nowIso: "2026-05-23T14:32:11Z",
    });
    expect(bm.added_at).toBe("2026-05-23T14:32:11Z");
    expect(bm.updated_at).toBe("2026-05-23T14:32:11Z");
  });

  it("strips tracking params when stripTrackingParams is true (issue #6)", () => {
    const bm = buildBookmark({
      url: "https://example.com/?utm_source=feed&q=real",
      title: "Article",
      machineId: "ABCDE12F",
      nowIso: "2026-05-23T14:32:11Z",
      stripTrackingParams: true,
    });
    expect(bm.url).toBe("https://example.com/?q=real");
  });

  it("preserves tracking params when stripTrackingParams is false (default)", () => {
    const bm = buildBookmark({
      url: "https://example.com/?utm_source=feed",
      title: "Article",
      machineId: "ABCDE12F",
      nowIso: "2026-05-23T14:32:11Z",
    });
    expect(bm.url).toBe("https://example.com/?utm_source=feed");
  });

  it("generates a fresh ULID each call", () => {
    const a = buildBookmark({
      url: "https://example.com/",
      title: "x",
      machineId: "ABCDE12F",
      nowIso: "2026-05-23T14:32:11Z",
    });
    const b = buildBookmark({
      url: "https://example.com/",
      title: "x",
      machineId: "ABCDE12F",
      nowIso: "2026-05-23T14:32:11Z",
    });
    expect(a.id).not.toBe(b.id);
  });
});
