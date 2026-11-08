import type { BookmarksFile, GitHubClient } from "@gitmarks/core";
import { GitHubNotFoundError, gcTombstones } from "@gitmarks/core";

export const BOOKMARKS_PATH = "bookmarks.json";

/**
 * Soft-deleted entries older than this are dropped from bookmarks.json on the
 * next extension write (spec: tombstones GC'd after 30 days). A device offline
 * longer than this never sees the delete, keeps its local copy, and its next
 * reconcile treats it as local-only — the accepted trade-off for a file that
 * doesn't grow forever.
 */
export const TOMBSTONE_TTL_DAYS = 30;

export function emptyBookmarksFile(nowIso: string): BookmarksFile {
  return { version: 1, updated_at: nowIso, bookmarks: [] };
}

// Run client.update on bookmarks.json; if the file doesn't exist yet
// (first write to a fresh repo), create it with an empty schema and retry.
// `mutate` must be pure — it may be invoked across the bootstrap retry
// and any internal 409 retries inside update(). Every write also drops
// tombstones past TOMBSTONE_TTL_DAYS, so GC rides along with normal writes
// instead of needing its own commits.
export async function updateBookmarksOrBootstrap(
  client: GitHubClient,
  mutateOnly: (current: BookmarksFile) => BookmarksFile,
  message: string,
  machineId: string,
  nowIso: string,
): Promise<void> {
  const mutate = (current: BookmarksFile): BookmarksFile =>
    gcTombstones(mutateOnly(current), TOMBSTONE_TTL_DAYS, nowIso);
  try {
    await client.update<BookmarksFile>(BOOKMARKS_PATH, mutate, message);
    return;
  } catch (err) {
    if (!(err instanceof GitHubNotFoundError)) throw err;
  }
  await client.write<BookmarksFile>(
    BOOKMARKS_PATH,
    emptyBookmarksFile(nowIso),
    `initialize bookmarks.json from chrome@${machineId}`,
  );
  await client.update<BookmarksFile>(BOOKMARKS_PATH, mutate, message);
}
