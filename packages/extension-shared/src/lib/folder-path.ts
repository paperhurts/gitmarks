export const BOOKMARKS_BAR_FOLDER = "";
export const OTHER_BOOKMARKS_FOLDER = "_other";

export interface TreeNode {
  id: string;
  title: string;
  parentId?: string;
  url?: string;
}

export function folderPathFromNode(
  node: TreeNode,
  nodesById: Map<string, TreeNode>,
  bookmarksBarId: string,
  otherBookmarksId: string,
): string | null {
  const ancestry: string[] = [];
  let current: TreeNode | undefined = node;
  while (current != null && current.parentId != null) {
    const parent = nodesById.get(current.parentId);
    if (parent == null) return null;
    if (parent.id === bookmarksBarId) {
      return ancestry.length === 0
        ? BOOKMARKS_BAR_FOLDER
        : [...ancestry].reverse().join("/");
    }
    if (parent.id === otherBookmarksId) {
      return ancestry.length === 0
        ? OTHER_BOOKMARKS_FOLDER
        : [OTHER_BOOKMARKS_FOLDER, ...[...ancestry].reverse()].join("/");
    }
    ancestry.push(parent.title);
    current = parent;
  }
  return null;
}

export interface SplitPath {
  root: "bar" | "other";
  segments: string[];
}

export function splitFolderPath(folder: string): SplitPath {
  if (folder === "" || folder === BOOKMARKS_BAR_FOLDER) {
    return { root: "bar", segments: [] };
  }
  if (folder === OTHER_BOOKMARKS_FOLDER) {
    return { root: "other", segments: [] };
  }
  if (folder.startsWith(OTHER_BOOKMARKS_FOLDER + "/")) {
    return {
      root: "other",
      segments: folder.slice(OTHER_BOOKMARKS_FOLDER.length + 1).split("/"),
    };
  }
  return { root: "bar", segments: folder.split("/") };
}
