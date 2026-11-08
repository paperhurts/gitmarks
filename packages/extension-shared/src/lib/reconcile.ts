import browser from "webextension-polyfill";
import type { Bookmarks } from "webextension-polyfill";
import type {
  BookmarksFile,
  Bookmark,
  GitHubClient,
} from "@gitmarks/core";
import {
  GitHubNotFoundError,
  isSafeBookmarkUrl,
  newUlid,
  normalizeUrl,
  addBookmark,
} from "@gitmarks/core";
import { applyRemoteChanges } from "./apply-remote.js";
import { type IdMap, asUlid, asNodeId } from "./id-mapping.js";
import { updateBookmarksOrBootstrap, BOOKMARKS_PATH } from "./bookmarks-file.js";

interface LocalEntry {
  nodeId: string;
  url: string;
  title: string;
}

export async function reconcile(
  client: GitHubClient,
  idMap: IdMap,
  bookmarksBarId: string,
  otherBookmarksId: string,
  machineId: string,
  nowIso: string,
  stripTrackingParams = false,
): Promise<void> {
  let remote: BookmarksFile;
  try {
    const r = await client.read<BookmarksFile>(BOOKMARKS_PATH);
    remote = r.data;
  } catch (err) {
    if (!(err instanceof GitHubNotFoundError)) throw err;
    remote = { version: 1, updated_at: nowIso, bookmarks: [] };
  }

  // Both sides are keyed by the SAME normalization used when uploading.
  // Keying local by raw URL while remote held normalized URLs (trailing
  // slash / fragment stripped) made every reconcile re-upload those
  // bookmarks under fresh ULIDs — unbounded duplication.
  const keyOf = (url: string): string | null => urlKey(url, stripTrackingParams);
  const localByUrl = await collectLocalBookmarks(bookmarksBarId, otherBookmarksId, keyOf);

  const remoteByUrl = new Map<string, Bookmark>();
  for (const b of remote.bookmarks) {
    if (b.deleted_at != null) continue;
    if (!isSafeBookmarkUrl(b.url)) {
      console.warn("[gitmarks] reconcile: skipping remote bookmark with unsafe URL scheme", { ulid: b.id, url: b.url });
      continue;
    }
    const key = keyOf(b.url);
    if (key == null) continue;
    // Keep the FIRST entry per URL (oldest in file order) so a repeat run
    // maps the same ULID each time.
    if (!remoteByUrl.has(key)) remoteByUrl.set(key, b);
  }

  for (const [url, b] of remoteByUrl) {
    const existing = localByUrl.get(url);
    if (existing != null) {
      idMap.set(asUlid(b.id), asNodeId(existing.nodeId));
    }
  }

  await applyRemoteChanges(remote, idMap, bookmarksBarId, otherBookmarksId);

  const localOnly: LocalEntry[] = [];
  for (const [key, local] of localByUrl) {
    if (!remoteByUrl.has(key)) {
      if (!isSafeBookmarkUrl(local.url)) {
        console.warn("[gitmarks] reconcile: skipping local bookmark with unsafe URL scheme", { url: local.url });
        continue;
      }
      localOnly.push(local);
    }
  }

  if (localOnly.length === 0) {
    await idMap.save();
    return;
  }

  const newBookmarks: Array<{ entry: LocalEntry; bm: Bookmark }> = [];
  for (const local of localOnly) {
    const id = newUlid();
    const bm: Bookmark = {
      id,
      url: normalizeUrl(local.url, { stripTrackingParams }),
      title: local.title,
      folder: "",
      tags: [],
      added_at: nowIso,
      updated_at: nowIso,
      added_from: `chrome@${machineId}`,
      deleted_at: null,
      notes: null,
    };
    newBookmarks.push({ entry: local, bm });
  }

  await updateBookmarksOrBootstrap(
    client,
    (current) => {
      // Dedupe against the file we're actually writing over (it may have
      // changed since our read, e.g. another device reconciled first).
      const present = new Set<string>();
      for (const b of current.bookmarks) {
        if (b.deleted_at != null) continue;
        const k = keyOf(b.url);
        if (k != null) present.add(k);
      }
      let next = current;
      for (const { bm } of newBookmarks) {
        const k = keyOf(bm.url);
        if (k == null || present.has(k)) continue;
        present.add(k);
        next = addBookmark(next, bm, nowIso);
      }
      return next;
    },
    `initial reconciliation from chrome@${machineId}`,
    machineId,
    nowIso,
  );

  for (const { entry, bm } of newBookmarks) {
    idMap.set(asUlid(bm.id), asNodeId(entry.nodeId));
  }
  await idMap.save();
}

/** Normalized comparison key for a URL, or null if it can't be parsed. */
export function urlKey(url: string, stripTrackingParams = false): string | null {
  try {
    return normalizeUrl(url, { stripTrackingParams });
  } catch {
    return null;
  }
}

async function collectLocalBookmarks(
  bookmarksBarId: string,
  otherBookmarksId: string,
  keyOf: (url: string) => string | null,
): Promise<Map<string, LocalEntry>> {
  const out = new Map<string, LocalEntry>();
  const tree = await browser.bookmarks.getTree();
  if (tree[0]?.children == null) return out;

  for (const top of tree[0].children) {
    if (top.id !== bookmarksBarId && top.id !== otherBookmarksId) continue;
    walk(top, out, keyOf);
  }
  return out;
}

function walk(
  node: Bookmarks.BookmarkTreeNode,
  out: Map<string, LocalEntry>,
  keyOf: (url: string) => string | null,
): void {
  if (node.url != null && node.url.length > 0) {
    const key = keyOf(node.url);
    // First local node per URL wins; later duplicates are left alone.
    if (key != null && !out.has(key)) {
      out.set(key, {
        nodeId: node.id,
        url: node.url,
        title: node.title,
      });
    }
  }
  if (node.children != null) {
    for (const child of node.children) walk(child, out, keyOf);
  }
}
