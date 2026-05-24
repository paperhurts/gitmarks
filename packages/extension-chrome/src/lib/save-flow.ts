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
} from "@gitmarks/core";
import { buildBookmark } from "./bookmark-factory.js";
import { updateBookmarksOrBootstrap } from "./bookmarks-file.js";

export interface PageInfo {
  url: string;
  title: string;
}

export type SaveResult =
  | { ok: true; bookmark: Bookmark }
  | {
      ok: false;
      kind: "not_configured" | "auth" | "conflict" | "not_found" | "unknown";
      message: string;
    };

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

function classify(err: unknown): SaveResult {
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
