import type {
  Bookmark,
  BookmarksFile,
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

const BOOKMARKS_PATH = "bookmarks.json";

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

function emptyBookmarksFile(nowIso: string): BookmarksFile {
  return { version: 1, updated_at: nowIso, bookmarks: [] };
}

export async function saveBookmark(
  client: GitHubClient,
  page: PageInfo,
  machineId: string,
  nowIso: string,
): Promise<SaveResult> {
  const bookmark = buildBookmark({
    url: page.url,
    title: page.title,
    machineId,
    nowIso,
  });
  const commitMsg = `add bookmark from chrome@${machineId}`;

  try {
    await client.update<BookmarksFile>(
      BOOKMARKS_PATH,
      (current) => addBookmark(current, bookmark, nowIso),
      commitMsg,
    );
    return { ok: true, bookmark };
  } catch (err) {
    if (err instanceof GitHubNotFoundError) {
      // First write ever — create the file, then retry the add.
      try {
        await client.write<BookmarksFile>(
          BOOKMARKS_PATH,
          emptyBookmarksFile(nowIso),
          `initialize bookmarks.json from chrome@${machineId}`,
        );
        await client.update<BookmarksFile>(
          BOOKMARKS_PATH,
          (current) => addBookmark(current, bookmark, nowIso),
          commitMsg,
        );
        return { ok: true, bookmark };
      } catch (err2) {
        return classify(err2);
      }
    }
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
  return { ok: false, kind: "unknown", message };
}
