import { describe, it, expect, beforeEach } from "vitest";
import type { BookmarksFile } from "@gitmarks/core";
import { applyRemoteChanges } from "../src/lib/apply-remote.js";
import { loadIdMap, setMapping } from "../src/lib/id-mapping.js";
import { clearSuppression, isSuppressed } from "../src/lib/suppression.js";

const BAR = "bar-id";
const OTHER = "other-id";

function bookmark(over: Partial<BookmarksFile["bookmarks"][0]>): BookmarksFile["bookmarks"][0] {
  return {
    id: "01HXYZ8K7M9P3RQ2V5W6Z8B0C1",
    url: "https://example.com/",
    title: "Example",
    folder: "",
    tags: [],
    added_at: "2026-05-23T00:00:00Z",
    updated_at: "2026-05-23T00:00:00Z",
    added_from: "chrome@test",
    deleted_at: null,
    notes: null,
    ...over,
  };
}

function file(bookmarks: BookmarksFile["bookmarks"]): BookmarksFile {
  return { version: 1, updated_at: "2026-05-23T00:00:00Z", bookmarks };
}

describe("applyRemoteChanges", () => {
  beforeEach(() => {
    clearSuppression();
  });

  it("creates new bookmarks not in the id map", async () => {
    const bm = bookmark({ id: "u1", url: "https://example.com/new" });
    const idMap = await loadIdMap();
    await applyRemoteChanges(file([bm]), idMap, BAR, OTHER);
    expect(chrome.bookmarks.create).toHaveBeenCalledWith({
      parentId: BAR,
      title: "Example",
      url: "https://example.com/new",
    });
    expect(isSuppressed("https://example.com/new")).toBe(true);
  });

  it("does not create a bookmark already mapped", async () => {
    const bm = bookmark({ id: "u1", url: "https://example.com/" });
    const idMap = await loadIdMap();
    setMapping(idMap, "u1", "node-1");
    await applyRemoteChanges(file([bm]), idMap, BAR, OTHER);
    expect(chrome.bookmarks.create).not.toHaveBeenCalled();
  });

  it("removes a chrome node for a tombstoned remote bookmark", async () => {
    const bm = bookmark({
      id: "u1",
      url: "https://example.com/",
      deleted_at: "2026-05-23T01:00:00Z",
    });
    const idMap = await loadIdMap();
    setMapping(idMap, "u1", "node-1");
    await applyRemoteChanges(file([bm]), idMap, BAR, OTHER);
    expect(chrome.bookmarks.remove).toHaveBeenCalledWith("node-1");
    expect(isSuppressed("https://example.com/")).toBe(true);
  });

  it("creates _other-rooted bookmarks under Other Bookmarks", async () => {
    const bm = bookmark({ id: "u1", url: "https://example.com/o", folder: "_other" });
    const idMap = await loadIdMap();
    await applyRemoteChanges(file([bm]), idMap, BAR, OTHER);
    expect(chrome.bookmarks.create).toHaveBeenCalledWith({
      parentId: OTHER,
      title: "Example",
      url: "https://example.com/o",
    });
  });
});
