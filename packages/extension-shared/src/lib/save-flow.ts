import type {
  Bookmark,
  GitHubClient,
} from "@gitmarks/core";
import {
  GitHubAuthError,
  GitHubConflictError,
  GitHubError,
  GitHubNotFoundError,
  addBookmark,
  addBookmarks,
  isSafeBookmarkUrl,
} from "@gitmarks/core";
import { buildBookmark } from "./bookmark-factory.js";
import { updateBookmarksOrBootstrap } from "./bookmarks-file.js";

export interface PageInfo {
  url: string;
  title: string;
}

export type SaveFailure = {
  ok: false;
  kind: "not_configured" | "auth" | "conflict" | "not_found" | "unknown";
  message: string;
};

export type SaveResult = { ok: true; bookmark: Bookmark } | SaveFailure;

/** Outcome of a "save all tabs" batch. `total` is the number of pages handed in. */
export type SaveAllTabsResult =
  | {
      ok: true;
      /** Bookmarks actually appended (after unsafe-URL and duplicate skips). */
      saved: number;
      /** Pages dropped because their URL scheme isn't a safe bookmark scheme. */
      skippedUnsafe: number;
      /** Safe pages dropped because the URL already existed (or repeated in the batch). */
      skippedDuplicate: number;
      total: number;
    }
  | SaveFailure;

export interface SaveOptions {
  stripTrackingParams?: boolean;
}

export async function saveBookmark(
  client: GitHubClient,
  page: PageInfo,
  machineId: string,
  nowIso: string,
  opts: SaveOptions = {},
): Promise<SaveResult> {
  const bookmark = buildBookmark({
    url: page.url,
    title: page.title,
    machineId,
    nowIso,
    ...(opts.stripTrackingParams !== undefined
      ? { stripTrackingParams: opts.stripTrackingParams }
      : {}),
  });
  const commitMsg = `add bookmark from chrome@${machineId}`;

  try {
    await updateBookmarksOrBootstrap(
      client,
      (current) => addBookmark(current, bookmark, nowIso),
      commitMsg,
      machineId,
      nowIso,
    );
    return { ok: true, bookmark };
  } catch (err) {
    console.error("[gitmarks] saveBookmark failed", err);
    return classify(err);
  }
}

/**
 * Save every page in `pages` (the current window's tabs) in one batched
 * `bookmarks.json` write. Unsafe-scheme pages are skipped up front; the rest
 * are de-duped by URL against existing active bookmarks (and within the batch)
 * inside the mutator, so the count stays correct across a 409 replay. All
 * saved bookmarks land in `opts.folder` (default root).
 */
export async function saveAllTabs(
  client: GitHubClient,
  pages: PageInfo[],
  machineId: string,
  nowIso: string,
  opts: SaveOptions & { folder?: string } = {},
): Promise<SaveAllTabsResult> {
  const total = pages.length;
  const safe = pages.filter((p) => isSafeBookmarkUrl(p.url));
  const skippedUnsafe = total - safe.length;

  const candidates = safe.map((p) =>
    buildBookmark({
      url: p.url,
      title: p.title,
      machineId,
      nowIso,
      folder: opts.folder ?? "",
      ...(opts.stripTrackingParams !== undefined
        ? { stripTrackingParams: opts.stripTrackingParams }
        : {}),
    }),
  );

  if (candidates.length === 0) {
    return { ok: true, saved: 0, skippedUnsafe, skippedDuplicate: 0, total };
  }

  const commitMsg = `add ${candidates.length} bookmark(s) from open tabs (chrome@${machineId})`;
  // Captured from the final (possibly replayed) mutator run — deterministic
  // given the file state that actually committed, so the count is authoritative.
  let saved = 0;
  try {
    await updateBookmarksOrBootstrap(
      client,
      (current) => {
        const next = addBookmarks(current, candidates, nowIso);
        saved = next.bookmarks.length - current.bookmarks.length;
        return next;
      },
      commitMsg,
      machineId,
      nowIso,
    );
    return {
      ok: true,
      saved,
      skippedUnsafe,
      skippedDuplicate: candidates.length - saved,
      total,
    };
  } catch (err) {
    console.error("[gitmarks] saveAllTabs failed", err);
    return classify(err);
  }
}

function classify(err: unknown): SaveFailure {
  if (err instanceof GitHubAuthError) {
    return { ok: false, kind: "auth", message: err.message };
  }
  if (err instanceof GitHubConflictError) {
    return { ok: false, kind: "conflict", message: err.message };
  }
  if (err instanceof GitHubNotFoundError) {
    return { ok: false, kind: "not_found", message: err.message };
  }
  if (err instanceof GitHubError) {
    return { ok: false, kind: "unknown", message: err.message };
  }
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("Failed to fetch") || message.includes("NetworkError")) {
    return { ok: false, kind: "unknown", message: "Network error — check your connection and try again." };
  }
  return { ok: false, kind: "unknown", message };
}
