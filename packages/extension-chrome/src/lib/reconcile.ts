import type {
  BookmarksFile,
  Bookmark,
  GitHubClient,
} from "@gitmarks/core";
import {
  GitHubNotFoundError,
  newUlid,
  normalizeUrl,
  addBookmark,
} from "@gitmarks/core";
import { applyRemoteChanges } from "./apply-remote.js";
import {
  saveIdMap,
  setMapping,
  type IdMap,
} from "./id-mapping.js";
import { updateBookmarksOrBootstrap } from "./bookmarks-file.js";

const BOOKMARKS_PATH = "bookmarks.json";

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
): Promise<void> {
  let remote: BookmarksFile;
  try {
    const r = await client.read<BookmarksFile>(BOOKMARKS_PATH);
    remote = r.data;
  } catch (err) {
    if (!(err instanceof GitHubNotFoundError)) throw err;
    remote = { version: 1, updated_at: nowIso, bookmarks: [] };
  }

  const localByUrl = await collectLocalBookmarks(bookmarksBarId, otherBookmarksId);

  const remoteByUrl = new Map<string, Bookmark>();
  for (const b of remote.bookmarks) {
    if (b.deleted_at != null) continue;
    remoteByUrl.set(b.url, b);
  }

  for (const [url, b] of remoteByUrl) {
    const existing = localByUrl.get(url);
    if (existing != null) {
      setMapping(idMap, b.id, existing.nodeId);
    }
  }

  await applyRemoteChanges(remote, idMap, bookmarksBarId, otherBookmarksId);

  const localOnly: LocalEntry[] = [];
  for (const [url, local] of localByUrl) {
    if (!remoteByUrl.has(url)) {
      localOnly.push(local);
    }
  }

  if (localOnly.length === 0) {
    await saveIdMap(idMap);
    return;
  }

  const newBookmarks: Array<{ entry: LocalEntry; bm: Bookmark }> = [];
  for (const local of localOnly) {
    const id = newUlid();
    const bm: Bookmark = {
      id,
      url: normalizeUrl(local.url),
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
      let next = current;
      for (const { bm } of newBookmarks) {
        next = addBookmark(next, bm, nowIso);
      }
      return next;
    },
    `initial reconciliation from chrome@${machineId}`,
    machineId,
    nowIso,
  );

  for (const { entry, bm } of newBookmarks) {
    setMapping(idMap, bm.id, entry.nodeId);
  }
  await saveIdMap(idMap);
}

async function collectLocalBookmarks(
  bookmarksBarId: string,
  otherBookmarksId: string,
): Promise<Map<string, LocalEntry>> {
  const out = new Map<string, LocalEntry>();
  const tree = await chrome.bookmarks.getTree();
  if (tree[0]?.children == null) return out;

  for (const top of tree[0].children) {
    if (top.id !== bookmarksBarId && top.id !== otherBookmarksId) continue;
    walk(top, out);
  }
  return out;
}

function walk(
  node: chrome.bookmarks.BookmarkTreeNode,
  out: Map<string, LocalEntry>,
): void {
  if (node.url != null && node.url.length > 0) {
    out.set(node.url, {
      nodeId: node.id,
      url: node.url,
      title: node.title,
    });
  }
  if (node.children != null) {
    for (const child of node.children) walk(child, out);
  }
}
