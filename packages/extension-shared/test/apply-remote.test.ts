import { describe, it, expect, beforeEach } from "vitest";
import type { BookmarksFile } from "@gitmarks/core";
import { applyRemoteChanges } from "../src/lib/apply-remote.js";
import { IdMap, asUlid, asNodeId } from "../src/lib/id-mapping.js";
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
    const idMap = await IdMap.load();
    await applyRemoteChanges(file([bm]), idMap, BAR, OTHER);
    expect(browser.bookmarks.create).toHaveBeenCalledWith({
      parentId: BAR,
      title: "Example",
      url: "https://example.com/new",
    });
    expect(isSuppressed("https://example.com/new")).toBe(true);
  });

  it("propagates a remote title change to the local node (issue #1)", async () => {
    const bm = bookmark({
      id: "u1",
      url: "https://example.com/",
      title: "New title from another device",
    });
    const idMap = await IdMap.load();
    idMap.set(asUlid("u1"), asNodeId("node-1"));

    // Current local node has the old title
    (browser.bookmarks.get as any).mockResolvedValueOnce([
      { id: "node-1", parentId: BAR, title: "Old title", url: "https://example.com/" },
    ]);

    await applyRemoteChanges(file([bm]), idMap, BAR, OTHER);

    expect(browser.bookmarks.update).toHaveBeenCalledWith("node-1", {
      title: "New title from another device",
    });
    // The URL is unchanged, but we still suppress to avoid an onChanged echo
    expect(isSuppressed("https://example.com/")).toBe(true);
  });

  it("propagates a remote URL change to the local node (issue #1)", async () => {
    const bm = bookmark({
      id: "u1",
      url: "https://example.com/new-path",
      title: "Same title",
    });
    const idMap = await IdMap.load();
    idMap.set(asUlid("u1"), asNodeId("node-1"));

    (browser.bookmarks.get as any).mockResolvedValueOnce([
      { id: "node-1", parentId: BAR, title: "Same title", url: "https://example.com/old-path" },
    ]);

    await applyRemoteChanges(file([bm]), idMap, BAR, OTHER);

    expect(browser.bookmarks.update).toHaveBeenCalledWith("node-1", {
      url: "https://example.com/new-path",
    });
    // Suppress BOTH the new URL (carried in the onChanged echo) AND the old
    // URL (in case a racing user edit on the old path is in flight).
    expect(isSuppressed("https://example.com/new-path")).toBe(true);
    expect(isSuppressed("https://example.com/old-path")).toBe(true);
  });

  it("silently skips a mapped-but-locally-deleted node (browser.bookmarks.get throws 'not found')", async () => {
    const bm = bookmark({ id: "u1", url: "https://example.com/", title: "Doesn't matter" });
    const idMap = await IdMap.load();
    idMap.set(asUlid("u1"), asNodeId("node-gone"));

    (browser.bookmarks.get as any).mockRejectedValueOnce(
      new Error("Can't find bookmark for id."),
    );

    // Should not throw; should not invoke update
    await applyRemoteChanges(file([bm]), idMap, BAR, OTHER);

    expect(browser.bookmarks.update).not.toHaveBeenCalled();
  });

  it("rethrows non-'not found' errors from browser.bookmarks.get", async () => {
    const bm = bookmark({ id: "u1", url: "https://example.com/", title: "Doesn't matter" });
    const idMap = await IdMap.load();
    idMap.set(asUlid("u1"), asNodeId("node-1"));

    (browser.bookmarks.get as any).mockRejectedValueOnce(
      new Error("Extension context invalidated."),
    );

    await expect(
      applyRemoteChanges(file([bm]), idMap, BAR, OTHER),
    ).rejects.toThrow(/Extension context invalidated/);
  });

  it("skips the update call when remote matches local (no spurious onChanged)", async () => {
    const bm = bookmark({
      id: "u1",
      url: "https://example.com/",
      title: "Same",
    });
    const idMap = await IdMap.load();
    idMap.set(asUlid("u1"), asNodeId("node-1"));

    (browser.bookmarks.get as any).mockResolvedValueOnce([
      { id: "node-1", parentId: BAR, title: "Same", url: "https://example.com/" },
    ]);

    await applyRemoteChanges(file([bm]), idMap, BAR, OTHER);

    expect(browser.bookmarks.update).not.toHaveBeenCalled();
  });

  it("does not create a bookmark already mapped", async () => {
    const bm = bookmark({ id: "u1", url: "https://example.com/" });
    const idMap = await IdMap.load();
    idMap.set(asUlid("u1"), asNodeId("node-1"));
    await applyRemoteChanges(file([bm]), idMap, BAR, OTHER);
    expect(browser.bookmarks.create).not.toHaveBeenCalled();
  });

  it("removes a chrome node for a tombstoned remote bookmark", async () => {
    const bm = bookmark({
      id: "u1",
      url: "https://example.com/",
      deleted_at: "2026-05-23T01:00:00Z",
    });
    const idMap = await IdMap.load();
    idMap.set(asUlid("u1"), asNodeId("node-1"));
    await applyRemoteChanges(file([bm]), idMap, BAR, OTHER);
    expect(browser.bookmarks.remove).toHaveBeenCalledWith("node-1");
    expect(isSuppressed("https://example.com/")).toBe(true);
  });

  it("creates _other-rooted bookmarks under Other Bookmarks", async () => {
    const bm = bookmark({ id: "u1", url: "https://example.com/o", folder: "_other" });
    const idMap = await IdMap.load();
    await applyRemoteChanges(file([bm]), idMap, BAR, OTHER);
    expect(browser.bookmarks.create).toHaveBeenCalledWith({
      parentId: OTHER,
      title: "Example",
      url: "https://example.com/o",
    });
  });

  it("creates nested subfolders when applying a remote bookmark in a path", async () => {
    const bm = bookmark({ id: "u1", url: "https://example.com/nested", folder: "Research/AI" });
    const idMap = await IdMap.load();

    // First getSubTree call (under BAR): no existing "Research" folder
    // Second getSubTree call (under the new Research folder): no existing "AI"
    (browser.bookmarks.getSubTree as any)
      .mockResolvedValueOnce([{ id: BAR, children: [] }])
      .mockResolvedValueOnce([{ id: "research-id", children: [] }]);
    (browser.bookmarks.create as any)
      .mockResolvedValueOnce({ id: "research-id", title: "Research" })  // folder 1
      .mockResolvedValueOnce({ id: "ai-id", title: "AI" })              // folder 2
      .mockResolvedValueOnce({ id: "bm-node", url: bm.url, title: bm.title }); // bookmark

    await applyRemoteChanges(file([bm]), idMap, BAR, OTHER);

    // Verify the bookmark itself was created under the AI folder
    const createCalls = (browser.bookmarks.create as any).mock.calls;
    const bmCreate = createCalls.find((c: any) => c[0].url === "https://example.com/nested");
    expect(bmCreate).toBeDefined();
    expect(bmCreate[0].parentId).toBe("ai-id");
  });

  it("saves the id map even when a later browser.bookmarks.create throws", async () => {
    const bm1 = bookmark({ id: "u1", url: "https://example.com/ok" });
    const bm2 = bookmark({ id: "u2", url: "https://example.com/fail" });
    const idMap = await IdMap.load();

    // First create succeeds, second throws.
    (browser.bookmarks.create as any)
      .mockResolvedValueOnce({ id: "node-1", url: bm1.url, title: bm1.title })
      .mockRejectedValueOnce(new Error("boom"));

    await expect(
      applyRemoteChanges(file([bm1, bm2]), idMap, BAR, OTHER),
    ).rejects.toThrow("boom");

    // The first mapping should still be persisted to storage.
    const reloaded = await IdMap.load();
    expect(reloaded.nodeForUlid(asUlid("u1"))).toBe("node-1");
  });

  it("reuses an existing subfolder when its title matches", async () => {
    const bm = bookmark({ id: "u1", url: "https://example.com/reuse", folder: "Reading" });
    const idMap = await IdMap.load();

    // Existing "Reading" folder under BAR
    (browser.bookmarks.getSubTree as any).mockResolvedValueOnce([
      { id: BAR, children: [{ id: "reading-id", title: "Reading" }] },
    ]);
    (browser.bookmarks.create as any).mockResolvedValueOnce({
      id: "bm-node",
      url: bm.url,
      title: bm.title,
    });

    await applyRemoteChanges(file([bm]), idMap, BAR, OTHER);

    // Only one create call (the bookmark itself) — the folder was reused
    expect((browser.bookmarks.create as any).mock.calls.length).toBe(1);
    const bmCreate = (browser.bookmarks.create as any).mock.calls[0];
    expect(bmCreate[0].parentId).toBe("reading-id");
  });
});
