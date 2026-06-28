import type { Bookmarks } from "webextension-polyfill";

// The "bookmarks toolbar" and "other bookmarks" root folders have different
// node IDs per browser, so we can't hardcode Chrome's:
//   Chrome:  "1" (Bookmarks Bar),        "2" (Other Bookmarks)
//   Firefox: "toolbar_____" (Toolbar),   "unfiled_____" (Other Bookmarks)
// Firefox's other roots ("menu________", "mobile______") are not synced — we
// map the toolbar to root ("") and unfiled to "_other", matching Chrome.
//
// startsWith (rather than the exact 12-char Firefox IDs) guards against
// miscounting underscores; user-created folders never use these reserved IDs,
// and we only ever scan the tree root's direct children here.
function classifyRoot(id: string): "bar" | "other" | null {
  if (id === "1" || id.startsWith("toolbar")) return "bar";
  if (id === "2" || id.startsWith("unfiled")) return "other";
  return null;
}

/**
 * Find the toolbar ("bar") and other-bookmarks root IDs among the bookmark
 * tree root's direct children. Works on both Chrome and Firefox. Throws (with
 * the ids it actually saw) if either root is missing.
 */
export function findRootIds(
  rootChildren: Bookmarks.BookmarkTreeNode[],
): { bar: string; other: string } {
  let bar: string | null = null;
  let other: string | null = null;
  for (const child of rootChildren) {
    const role = classifyRoot(child.id);
    if (role === "bar") bar = child.id;
    else if (role === "other") other = child.id;
  }
  if (bar == null || other == null) {
    const seen = rootChildren.map((c) => `${c.id}:${c.title}`).join(", ");
    throw new Error(
      `could not find the bookmarks toolbar / other-bookmarks roots in the tree (saw: ${seen})`,
    );
  }
  return { bar, other };
}
