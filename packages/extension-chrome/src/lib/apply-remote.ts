import type { BookmarksFile } from "@gitmarks/core";
import {
  saveIdMap,
  setMapping,
  removeUlidMapping,
  nodeForUlid,
  type IdMap,
} from "./id-mapping.js";
import { splitFolderPath } from "./folder-path.js";
import { suppress } from "./suppression.js";

export async function applyRemoteChanges(
  remote: BookmarksFile,
  idMap: IdMap,
  bookmarksBarId: string,
  otherBookmarksId: string,
): Promise<void> {
  for (const bm of remote.bookmarks) {
    const existingNode = nodeForUlid(idMap, bm.id);

    if (bm.deleted_at != null) {
      if (existingNode != null) {
        suppress(bm.url);
        try {
          await chrome.bookmarks.remove(existingNode);
        } catch {
          // Node may already be gone; ignore.
        }
        removeUlidMapping(idMap, bm.id);
      }
      continue;
    }

    if (existingNode != null) {
      // Already in the local tree — assume in sync; next reconcile fixes drift.
      continue;
    }

    const parentId = await ensureFolderPath(
      bm.folder,
      bookmarksBarId,
      otherBookmarksId,
    );
    suppress(bm.url);
    const created = await chrome.bookmarks.create({
      parentId,
      title: bm.title,
      url: bm.url,
    });
    setMapping(idMap, bm.id, created.id);
  }
  await saveIdMap(idMap);
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
  const children = await chrome.bookmarks.getSubTree(parentId);
  const parent = children[0];
  if (parent?.children != null) {
    for (const child of parent.children) {
      if (child.url == null && child.title === title) return child.id;
    }
  }
  const folder = await chrome.bookmarks.create({ parentId, title });
  return folder.id;
}
