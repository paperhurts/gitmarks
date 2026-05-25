import type { BookmarksFile, TagsFile } from "@gitmarks/core";
import { BookmarkRow } from "./BookmarkRow.js";
import { visibleBookmarks } from "../lib/data.js";

interface Props {
  bookmarksFile: BookmarksFile;
  tagsFile: TagsFile;
}

export function BookmarkList({ bookmarksFile, tagsFile }: Props) {
  const items = visibleBookmarks(bookmarksFile);
  if (items.length === 0) {
    return (
      <p className="p-6 text-cyan-soft/60">
        No bookmarks yet. Save one from a browser extension to see it here.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-fog">
      {items.map((b) => (
        <BookmarkRow key={b.id} bookmark={b} tagsFile={tagsFile} />
      ))}
    </ul>
  );
}
