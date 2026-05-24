import type { BookmarksFile, GitHubClient } from "@gitmarks/core";
import { GitHubNotFoundError } from "@gitmarks/core";

export const BOOKMARKS_PATH = "bookmarks.json";

export function emptyBookmarksFile(nowIso: string): BookmarksFile {
  return { version: 1, updated_at: nowIso, bookmarks: [] };
}

// Run client.update on bookmarks.json; if the file doesn't exist yet
// (first write to a fresh repo), create it with an empty schema and retry.
// `mutate` must be pure — it may be invoked across the bootstrap retry
// and any internal 409 retries inside update().
export async function updateBookmarksOrBootstrap(
  client: GitHubClient,
  mutate: (current: BookmarksFile) => BookmarksFile,
  message: string,
  machineId: string,
  nowIso: string,
): Promise<void> {
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
