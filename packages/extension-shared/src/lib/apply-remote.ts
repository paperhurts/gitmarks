import browser from "webextension-polyfill";
import type { Bookmarks } from "webextension-polyfill";
import type { BookmarksFile } from "@gitmarks/core";
import { type IdMap, asUlid, asNodeId } from "./id-mapping.js";
import { splitFolderPath } from "./folder-path.js";
import { suppress, suppressNode } from "./suppression.js";

export async function applyRemoteChanges(
  remote: BookmarksFile,
  idMap: IdMap,
  bookmarksBarId: string,
  otherBookmarksId: string,
): Promise<void> {
  try {
    for (const bm of remote.bookmarks) {
      const existingNode = idMap.nodeForUlid(asUlid(bm.id));

      if (bm.deleted_at != null) {
        if (existingNode != null) {
          suppress(bm.url);
          try {
            await browser.bookmarks.remove(existingNode);
            idMap.removeByUlid(asUlid(bm.id));
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes("Can't find bookmark") || msg.includes("not found")) {
              // Local node already gone — safe to clear the mapping too.
              idMap.removeByUlid(asUlid(bm.id));
            } else {
              // Real failure (managed bookmarks, permissions, etc.) — keep the mapping
              // and re-throw so the caller knows the apply was partial.
              console.error("[gitmarks] failed to apply remote delete", {
                ulid: bm.id, nodeId: existingNode, err,
              });
              throw err;
            }
          }
        }
        continue;
      }

      if (existingNode != null) {
        // Remote bookmark already in the local tree — propagate title/url
        // changes so users on Device A see edits from Device B within the
        // 5-minute poll window (issue #1).
        await applyRemoteEdit(existingNode, bm.url, bm.title);
        continue;
      }

      const parentId = await ensureFolderPath(
        bm.folder,
        bookmarksBarId,
        otherBookmarksId,
      );
      suppress(bm.url);
      const created = await browser.bookmarks.create({
        parentId,
        title: bm.title,
        url: bm.url,
      });
      idMap.set(asUlid(bm.id), asNodeId(created.id));
    }
  } finally {
    // Save mappings for any work that DID succeed, even if a later iteration
    // threw. The local chrome.bookmarks state is durable; the idMap must
    // match it.
    await idMap.save();
  }
}

async function applyRemoteEdit(
  nodeId: string,
  remoteUrl: string,
  remoteTitle: string,
): Promise<void> {
  let current: Bookmarks.BookmarkTreeNode | undefined;
  try {
    const found = await browser.bookmarks.get(nodeId);
    current = found[0];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Can't find bookmark") || msg.includes("not found")) {
      // Local node was deleted between mapping and apply — expected; skip.
      return;
    }
    // Real failure (extension-context invalidated, managed bookmarks,
    // permissions, etc.) — propagate so the outer poll catch records it.
    console.error("[gitmarks] failed to read local node for remote edit", {
      nodeId, err,
    });
    throw err;
  }
  if (current == null) return;

  const changes: { title?: string; url?: string } = {};
  if (current.title !== remoteTitle) changes.title = remoteTitle;
  if (current.url !== remoteUrl) changes.url = remoteUrl;
  if (Object.keys(changes).length === 0) return;

  // Prevent the resulting onChanged echo from being pushed back to GitHub
  // as if it were a user edit (loop-back). Cover all three echo shapes:
  //   - URL change: changeInfo carries the NEW url → suppress(remoteUrl)
  //   - URL change races a user edit on the OLD url → suppress(current.url)
  //   - title-only change: changeInfo.url is undefined → URL suppression
  //     can't see it, so we also key suppression by node id.
  if (current.url != null && current.url.length > 0) suppress(current.url);
  suppress(remoteUrl);
  suppressNode(nodeId);

  await browser.bookmarks.update(nodeId, changes);
}

async function ensureFolderPath(
  folder: string,
  bookmarksBarId: string,
  otherBookmarksId: string,
): Promise<string> {
  const { root, segments } = splitFolderPath(folder);
  let parentId = root === "bar" ? bookmarksBarId : otherBookmarksId;
  for (const segment of segments) {
    parentId = await ensureSubfolder(parentId, segment);
  }
  return parentId;
}

async function ensureSubfolder(parentId: string, title: string): Promise<string> {
  const children = await browser.bookmarks.getSubTree(parentId);
  const parent = children[0];
  if (parent?.children != null) {
    for (const child of parent.children) {
      if (child.url == null && child.title === title) return child.id;
    }
  }
  const folder = await browser.bookmarks.create({ parentId, title });
  return folder.id;
}
