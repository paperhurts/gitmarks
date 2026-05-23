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

  it("creates nested subfolders when applying a remote bookmark in a path", async () => {
    const bm = bookmark({ id: "u1", url: "https://example.com/nested", folder: "Research/AI" });
    const idMap = await loadIdMap();

    // First getSubTree call (under BAR): no existing "Research" folder
    // Second getSubTree call (under the new Research folder): no existing "AI"
    (chrome.bookmarks.getSubTree as any)
      .mockResolvedValueOnce([{ id: BAR, children: [] }])
      .mockResolvedValueOnce([{ id: "research-id", children: [] }]);
    (chrome.bookmarks.create as any)
      .mockResolvedValueOnce({ id: "research-id", title: "Research" })  // folder 1
      .mockResolvedValueOnce({ id: "ai-id", title: "AI" })              // folder 2
      .mockResolvedValueOnce({ id: "bm-node", url: bm.url, title: bm.title }); // bookmark

    await applyRemoteChanges(file([bm]), idMap, BAR, OTHER);

    // Verify the bookmark itself was created under the AI folder
    const createCalls = (chrome.bookmarks.create as any).mock.calls;
    const bmCreate = createCalls.find((c: any) => c[0].url === "https://example.com/nested");
    expect(bmCreate).toBeDefined();
    expect(bmCreate[0].parentId).toBe("ai-id");
  });

  it("reuses an existing subfolder when its title matches", async () => {
    const bm = bookmark({ id: "u1", url: "https://example.com/reuse", folder: "Reading" });
    const idMap = await loadIdMap();

    // Existing "Reading" folder under BAR
    (chrome.bookmarks.getSubTree as any).mockResolvedValueOnce([
      { id: BAR, children: [{ id: "reading-id", title: "Reading" }] },
    ]);
    (chrome.bookmarks.create as any).mockResolvedValueOnce({
      id: "bm-node",
      url: bm.url,
      title: bm.title,
    });

    await applyRemoteChanges(file([bm]), idMap, BAR, OTHER);

    // Only one create call (the bookmark itself) — the folder was reused
    expect((chrome.bookmarks.create as any).mock.calls.length).toBe(1);
    const bmCreate = (chrome.bookmarks.create as any).mock.calls[0];
    expect(bmCreate[0].parentId).toBe("reading-id");
  });
});
