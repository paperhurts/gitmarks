import type {
  Bookmark,
  BookmarksFile,
  GitHubClient,
} from "@gitmarks/core";
import {
  addBookmark,
  newUlid,
  normalizeUrl,
  softDeleteBookmark,
  updateBookmark,
} from "@gitmarks/core";
import {
  setMapping,
  removeNodeMapping,
  ulidForNode,
  saveIdMap,
  type IdMap,
} from "./id-mapping.js";
import { isSuppressed } from "./suppression.js";
import { updateBookmarksOrBootstrap } from "./bookmarks-file.js";

const DEBOUNCE_MS = 500;
const LAST_ERROR_KEY = "gitmarks:lastError";

type Pending =
  | { kind: "create"; nodeId: string; url: string; title: string }
  | { kind: "update"; nodeId: string; url?: string; title?: string }
  | { kind: "remove"; nodeId: string };

export interface ListenerDeps {
  getClient: () => Promise<GitHubClient>;
  getIdMap: () => Promise<IdMap>;
  getBarOtherIds: () => Promise<{ bar: string; other: string }>;
  getMachineId: () => Promise<string>;
}

let pending: Pending[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let deps: ListenerDeps | null = null;

export function __resetForTest(): void {
  pending = [];
  if (timer != null) {
    clearTimeout(timer);
    timer = null;
  }
  deps = null;
}

export function registerListeners(d: ListenerDeps): void {
  deps = d;
  chrome.bookmarks.onCreated.addListener(onCreated);
  chrome.bookmarks.onChanged.addListener(onChanged);
  chrome.bookmarks.onMoved.addListener(onMoved);
  chrome.bookmarks.onRemoved.addListener(onRemoved);
}

function schedule(): void {
  if (timer != null) return;
  timer = setTimeout(() => {
    timer = null;
    flushPending().catch(async (err) => {
      console.error("[gitmarks] flushPending failed; pending edits remain queued", err);
      await chrome.storage.local.set({
        [LAST_ERROR_KEY]: {
          when: Date.now(),
          message: err instanceof Error ? err.message : String(err),
          source: "flush",
        },
      });
    });
  }, DEBOUNCE_MS);
}

function onCreated(_id: string, node: chrome.bookmarks.BookmarkTreeNode): void {
  if (node.url == null || node.url.length === 0) return;
  pending.push({
    kind: "create",
    nodeId: node.id,
    url: node.url,
    title: node.title,
  });
  schedule();
}

function onChanged(id: string, changeInfo: chrome.bookmarks.BookmarkChangeInfo): void {
  const patch: { kind: "update"; nodeId: string; url?: string; title?: string } = {
    kind: "update",
    nodeId: id,
    title: changeInfo.title,
  };
  if (changeInfo.url !== undefined) patch.url = changeInfo.url;
  pending.push(patch);
  schedule();
}

function onMoved(_id: string, _moveInfo: chrome.bookmarks.BookmarkMoveInfo): void {
  // Folder updates via onMoved are deferred to v1.5 — next reconcile catches drift.
}

function onRemoved(id: string, _removeInfo: chrome.bookmarks.BookmarkRemoveInfo): void {
  pending.push({ kind: "remove", nodeId: id });
  schedule();
}

export async function flushPending(): Promise<void> {
  if (deps == null) throw new Error("listeners not registered");
  if (pending.length === 0) return;

  const batch = pending.slice();  // snapshot, but don't clear yet

  const idMap = await deps.getIdMap();
  const machineId = await deps.getMachineId();
  const nowIso = new Date().toISOString();

  const surviving = batch.filter((p) => {
    if (p.kind === "create") return !isSuppressed(p.url);
    if (p.kind === "update" && p.url != null) return !isSuppressed(p.url);
    return true;
  });
  if (surviving.length === 0) {
    pending = [];  // suppression dropped everything; safe to clear
    return;
  }

  const client = await deps.getClient();

  // Pre-assign ULIDs for creates so the mutate fn is pure (idempotent on retry).
  const createUlids = new Map<string, string>();
  for (const event of surviving) {
    if (event.kind === "create" && ulidForNode(idMap, event.nodeId) == null) {
      createUlids.set(event.nodeId, newUlid());
    }
  }

  // Track which mappings need updating after a successful write.
  const toAdd: Array<{ ulid: string; nodeId: string }> = [];
  const toRemove: string[] = [];

  await updateBookmarksOrBootstrap(
    client,
    (current) => {
      toAdd.length = 0;
      toRemove.length = 0;
      return applyBatch(current, surviving, idMap, createUlids, machineId, nowIso, toAdd, toRemove);
    },
    `sync ${surviving.length} change(s) from chrome@${machineId}`,
    machineId,
    nowIso,
  );

  // Only after the update succeeds: apply id-map side effects and clear pending.
  for (const { ulid, nodeId } of toAdd) {
    setMapping(idMap, ulid, nodeId);
  }
  for (const nodeId of toRemove) {
    removeNodeMapping(idMap, nodeId);
  }
  await saveIdMap(idMap);
  // Remove only the events we actually processed; new events arrived during
  // the await are preserved.
  pending = pending.slice(batch.length);
}

function applyBatch(
  initial: BookmarksFile,
  batch: Pending[],
  idMap: IdMap,
  createUlids: Map<string, string>,
  machineId: string,
  nowIso: string,
  toAdd: Array<{ ulid: string; nodeId: string }>,
  toRemove: string[],
): BookmarksFile {
  let file = initial;
  for (const event of batch) {
    if (event.kind === "create") {
      // createUlids only contains entries for nodes that were unmapped at flush
      // time — nodes already in idMap were excluded during pre-computation.
      const id = createUlids.get(event.nodeId);
      if (id == null) continue;
      const bm: Bookmark = {
        id,
        url: normalizeUrl(event.url),
        title: event.title,
        folder: "",
        tags: [],
        added_at: nowIso,
        updated_at: nowIso,
        added_from: `chrome@${machineId}`,
        deleted_at: null,
        notes: null,
      };
      file = addBookmark(file, bm, nowIso);
      toAdd.push({ ulid: id, nodeId: event.nodeId });
    } else if (event.kind === "update") {
      const ulid = ulidForNode(idMap, event.nodeId);
      if (ulid == null) continue;
      const patch: Partial<Omit<Bookmark, "id">> = {};
      if (event.url != null) patch.url = normalizeUrl(event.url);
      if (event.title != null) patch.title = event.title;
      if (Object.keys(patch).length === 0) continue;
      file = updateBookmark(file, ulid, patch, nowIso);
    } else if (event.kind === "remove") {
      const ulid = ulidForNode(idMap, event.nodeId);
      if (ulid == null) continue;
      file = softDeleteBookmark(file, ulid, nowIso);
      toRemove.push(event.nodeId);
    }
  }
  return file;
}
