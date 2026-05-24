import { describe, it, expect } from "vitest";
import {
  folderPathFromNode,
  splitFolderPath,
  BOOKMARKS_BAR_FOLDER,
  OTHER_BOOKMARKS_FOLDER,
} from "../src/lib/folder-path.js";
import type { TreeNode } from "../src/lib/folder-path.js";

function n(
  id: string,
  title: string,
  parentId?: string,
  url?: string,
): TreeNode {
  const node: TreeNode = { id, title };
  if (parentId !== undefined) node.parentId = parentId;
  if (url !== undefined) node.url = url;
  return node;
}

describe("folder-path constants", () => {
  it("BOOKMARKS_BAR_FOLDER is empty string", () => {
    expect(BOOKMARKS_BAR_FOLDER).toBe("");
  });
  it("OTHER_BOOKMARKS_FOLDER is '_other'", () => {
    expect(OTHER_BOOKMARKS_FOLDER).toBe("_other");
  });
});

describe("folderPathFromNode", () => {
  it("returns '' for a node directly under Bookmarks Bar", () => {
    const nodesById = new Map<string, TreeNode>();
    nodesById.set("0", n("0", ""));
    nodesById.set("1", n("1", "Bookmarks Bar", "0"));
    nodesById.set("100", n("100", "Article", "1", "https://example.com/"));
    expect(folderPathFromNode(nodesById.get("100")!, nodesById, "1", "2")).toBe("");
  });

  it("returns '_other' for a node directly under Other Bookmarks", () => {
    const nodesById = new Map<string, TreeNode>();
    nodesById.set("0", n("0", ""));
    nodesById.set("2", n("2", "Other Bookmarks", "0"));
    nodesById.set("200", n("200", "Article", "2", "https://example.com/"));
    expect(folderPathFromNode(nodesById.get("200")!, nodesById, "1", "2")).toBe("_other");
  });

  it("joins nested folders under Bookmarks Bar with '/'", () => {
    const nodesById = new Map<string, TreeNode>();
    nodesById.set("0", n("0", ""));
    nodesById.set("1", n("1", "Bookmarks Bar", "0"));
    nodesById.set("10", n("10", "Research", "1"));
    nodesById.set("11", n("11", "AI", "10"));
    nodesById.set("100", n("100", "Paper", "11", "https://example.com/"));
    expect(folderPathFromNode(nodesById.get("100")!, nodesById, "1", "2")).toBe("Research/AI");
  });

  it("prefixes nested-under-Other paths with '_other/'", () => {
    const nodesById = new Map<string, TreeNode>();
    nodesById.set("0", n("0", ""));
    nodesById.set("2", n("2", "Other Bookmarks", "0"));
    nodesById.set("20", n("20", "Reading", "2"));
    nodesById.set("200", n("200", "Article", "20", "https://example.com/"));
    expect(folderPathFromNode(nodesById.get("200")!, nodesById, "1", "2")).toBe("_other/Reading");
  });

  it("returns null when the node is outside the syncable subtree (mobile, managed, etc.)", () => {
    const nodesById = new Map<string, TreeNode>();
    nodesById.set("0", n("0", ""));
    nodesById.set("3", n("3", "Mobile Bookmarks", "0"));
    nodesById.set("300", n("300", "Article", "3", "https://example.com/"));
    expect(folderPathFromNode(nodesById.get("300")!, nodesById, "1", "2")).toBeNull();
  });
});

describe("splitFolderPath", () => {
  it("returns ['bar'] for the root path ''", () => {
    expect(splitFolderPath("")).toEqual({ root: "bar", segments: [] });
  });
  it("returns ['other'] for '_other'", () => {
    expect(splitFolderPath("_other")).toEqual({ root: "other", segments: [] });
  });
  it("returns ['bar', 'Research', 'AI'] for 'Research/AI'", () => {
    expect(splitFolderPath("Research/AI")).toEqual({ root: "bar", segments: ["Research", "AI"] });
  });
  it("returns ['other', 'Reading'] for '_other/Reading'", () => {
    expect(splitFolderPath("_other/Reading")).toEqual({ root: "other", segments: ["Reading"] });
  });
});
