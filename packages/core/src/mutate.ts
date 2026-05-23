import type { Bookmark, BookmarksFile } from "./schema/bookmarks.js";

export function addBookmark(
  file: BookmarksFile,
  bookmark: Bookmark,
  nowIso: string,
): BookmarksFile {
  return {
    ...file,
    updated_at: nowIso,
    bookmarks: [...file.bookmarks, bookmark],
  };
}

export function updateBookmark(
  file: BookmarksFile,
  id: string,
  patch: Partial<Omit<Bookmark, "id">>,
  nowIso: string,
): BookmarksFile {
  const idx = file.bookmarks.findIndex((b) => b.id === id);
  if (idx === -1) {
    throw new Error(`bookmark not found: ${id}`);
  }
  const next = [...file.bookmarks];
  const existing = next[idx]!;
  next[idx] = { ...existing, ...patch, updated_at: nowIso };
  return { ...file, updated_at: nowIso, bookmarks: next };
}

export function softDeleteBookmark(
  file: BookmarksFile,
  id: string,
  nowIso: string,
): BookmarksFile {
  return updateBookmark(file, id, { deleted_at: nowIso }, nowIso);
}

export function gcTombstones(
  file: BookmarksFile,
  olderThanDays: number,
  nowIso: string,
): BookmarksFile {
  const cutoffMs = new Date(nowIso).getTime() - olderThanDays * 86_400_000;
  const kept = file.bookmarks.filter((b) => {
    if (b.deleted_at == null) return true;
    return new Date(b.deleted_at).getTime() > cutoffMs;
  });
  if (kept.length === file.bookmarks.length) {
    return { ...file, updated_at: nowIso };
  }
  return { ...file, updated_at: nowIso, bookmarks: kept };
}
