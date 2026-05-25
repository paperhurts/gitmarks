import type { Bookmark, BookmarksFile } from "@gitmarks/core";

export function visibleBookmarks(file: BookmarksFile): Bookmark[] {
  return file.bookmarks.filter((b) => b.deleted_at == null);
}

export function searchBookmarks(bookmarks: Bookmark[], query: string): Bookmark[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return bookmarks;
  return bookmarks.filter((b) => {
    if (b.title.toLowerCase().includes(q)) return true;
    if (b.url.toLowerCase().includes(q)) return true;
    if (b.notes != null && b.notes.toLowerCase().includes(q)) return true;
    return b.tags.some((t) => t.toLowerCase().includes(q));
  });
}

export function allUsedTags(bookmarks: Bookmark[]): Set<string> {
  const out = new Set<string>();
  for (const b of bookmarks) for (const t of b.tags) out.add(t);
  return out;
}
