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
import { type IdMap, asUlid, asNodeId } from "./id-mapping.js";
import { isSuppressed, isNodeSuppressed } from "./suppression.js";
import { updateBookmarksOrBootstrap } from "./bookmarks-file.js";
import { LAST_ERROR_KEY, type LastErrorRecord } from "./background-core.js";

const DEBOUNCE_MS = 500;
const MAX_BACKOFF_MS = 60_000;

type Pending =
  | { kind: "create"; nodeId: string; url: string; title: string }
  | { kind: "update"; nodeId: string; url: string; title?: string }
  | { kind: "update"; nodeId: string; url?: string; title: string }
  | { kind: "remove"; nodeId: string; url: string };

export interface ListenerDeps {
  getClient: () => Promise<GitHubClient>;
  getIdMap: () => Promise<IdMap>;
  getBarOtherIds: () => Promise<{ bar: string; other: string }>;
  getMachineId: () => Promise<string>;
}

let pending: Pending[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let deps: ListenerDeps | null = null;
let flushing = false;
let pendingReschedule = false;
let consecutiveFailures = 0;

export function __resetForTest(): void {
  pending = [];
  if (timer != null) {
    clearTimeout(timer);
    timer = null;
  }
  deps = null;
  flushing = false;
  pendingReschedule = false;
  consecutiveFailures = 0;
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
  if (flushing) {
    pendingReschedule = true;
    return;
  }
  const delay = consecutiveFailures === 0
    ? DEBOUNCE_MS
    : Math.min(DEBOUNCE_MS * 2 ** consecutiveFailures, MAX_BACKOFF_MS);
  timer = setTimeout(() => {
    timer = null;
    void runFlush();
  }, delay);
}

async function runFlush(): Promise<void> {
  flushing = true;
  try {
    await flushPending();
    consecutiveFailures = 0;
    await chrome.storage.local.remove(LAST_ERROR_KEY);
  } catch (err) {
    consecutiveFailures += 1;
    console.error(
      `[gitmarks] flushPending failed (attempt ${consecutiveFailures}); pending edits remain queued`,
      err,
    );
    const record: LastErrorRecord = {
      when: Date.now(),
      message: err instanceof Error ? err.message : String(err),
      source: "flush",
      kind: "unknown",
    };
    await chrome.storage.local.set({ [LAST_ERROR_KEY]: record });
  } finally {
    flushing = false;
    if (pendingReschedule || pending.length > 0) {
      pendingReschedule = false;
      schedule();
    }
  }
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
  const url = changeInfo.url;
  const title = changeInfo.title;
  if (url === undefined && title === undefined) return;
  if (url !== undefined && title !== undefined) {
    pending.push({ kind: "update", nodeId: id, url, title });
  } else if (url !== undefined) {
    pending.push({ kind: "update", nodeId: id, url });
  } else if (title !== undefined) {
    pending.push({ kind: "update", nodeId: id, title });
  }
  schedule();
}

function onMoved(_id: string, _moveInfo: chrome.bookmarks.BookmarkMoveInfo): void {
  // Folder moves are intentionally not pushed from the listener; the periodic reconcile catches folder drift.
}

function onRemoved(id: string, removeInfo: chrome.bookmarks.BookmarkRemoveInfo): void {
  // Only sync bookmarks (URL-bearing nodes), not folders.
  if (removeInfo.node.url == null || removeInfo.node.url.length === 0) return;
  pending.push({ kind: "remove", nodeId: id, url: removeInfo.node.url });
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
    // Updates and removes against an unmapped node would no-op inside the
    // mutate fn; skip them now so we don't invoke client.update with nothing
    // to do (issue #8).
    if (p.kind === "update") {
      if (idMap.ulidForNode(asNodeId(p.nodeId)) == null) return false;
      // NodeId-suppression catches title-only echoes from apply-remote.update
      // (changeInfo.url is undefined for title-only changes — issue #18 A).
      if (isNodeSuppressed(p.nodeId)) return false;
      return p.url == null || !isSuppressed(p.url);
    }
    if (p.kind === "remove") {
      if (idMap.ulidForNode(asNodeId(p.nodeId)) == null) return false;
      if (isNodeSuppressed(p.nodeId)) return false;
      return !isSuppressed(p.url);
    }
    return true;
  });
  if (surviving.length === 0) {
    pending = [];  // suppression dropped everything; safe to clear
    return;
  }

  const client = await deps.getClient();

  // Pre-assign ULIDs for creates so the mutate fn passed to updateBookmarksOrBootstrap
  // stays pure across its bootstrap + 409 retries (otherwise newUlid() would mint
  // a different ULID on each invocation).
  const createUlids = new Map<string, string>();
  for (const event of surviving) {
    if (event.kind === "create" && idMap.ulidForNode(asNodeId(event.nodeId)) == null) {
      createUlids.set(event.nodeId, newUlid());
    }
  }

  // Track which mappings need updating after a successful write.
  const toAdd: Array<{ ulid: string; nodeId: string }> = [];
  const toRemove: string[] = [];  // plain string nodeIds; branded inside loop

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
    idMap.set(asUlid(ulid), asNodeId(nodeId));
  }
  for (const nodeId of toRemove) {
    idMap.removeByNode(asNodeId(nodeId));
  }
  await idMap.save();
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
      // Skip if already mapped — a previous batch already created the remote entry;
      // treat duplicate create events as no-ops.
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
      const ulid = idMap.ulidForNode(asNodeId(event.nodeId));
      if (ulid == null) continue;
      const existing = file.bookmarks.find((b) => b.id === ulid);
      if (existing == null) continue;
      const patch: Partial<Omit<Bookmark, "id">> = {};
      if ("url" in event && event.url !== undefined) {
        const normalized = normalizeUrl(event.url);
        if (normalized !== existing.url) patch.url = normalized;
      }
      if ("title" in event && event.title !== undefined) {
        if (event.title !== existing.title) patch.title = event.title;
      }
      if (Object.keys(patch).length === 0) continue;
      file = updateBookmark(file, ulid, patch, nowIso);
    } else if (event.kind === "remove") {
      const ulid = idMap.ulidForNode(asNodeId(event.nodeId));
      if (ulid == null) continue;
      file = softDeleteBookmark(file, ulid, nowIso);
      toRemove.push(event.nodeId);
    }
  }
  return file;
}
