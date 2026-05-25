import type { BookmarksFile, TagsFile } from "@gitmarks/core";
import { BookmarkRow } from "./BookmarkRow.js";
import { visibleBookmarks } from "../lib/data.js";

interface Props {
  bookmarksFile: BookmarksFile;
  tagsFile: TagsFile;
  selected?: ReadonlySet<string>;
  onToggleSelect?: (id: string) => void;
  onSetAll?: (ids: string[]) => void;
}

export function BookmarkList({
  bookmarksFile,
  tagsFile,
  selected,
  onToggleSelect,
  onSetAll,
}: Props) {
  const items = visibleBookmarks(bookmarksFile);
  if (items.length === 0) {
    return (
      <p className="p-6 text-cyan-soft/60">
        No bookmarks yet. Save one from a browser extension to see it here.
      </p>
    );
  }
  const showSelectAll = onToggleSelect !== undefined;
  const allSelected =
    showSelectAll && selected !== undefined && items.length > 0 && items.every((b) => selected.has(b.id));
  return (
    <div>
      {showSelectAll && (
        <div className="border-b border-fog px-4 py-2 flex items-center gap-3 text-xs text-cyan-soft/60">
          <input
            type="checkbox"
            aria-label="select all"
            checked={allSelected}
            onChange={() => {
              if (onSetAll !== undefined) {
                onSetAll(allSelected ? [] : items.map((b) => b.id));
              }
            }}
          />
          <span>{selected?.size ?? 0} of {items.length}</span>
        </div>
      )}
      <ul className="divide-y divide-fog">
        {items.map((b) => (
          <BookmarkRow
            key={b.id}
            bookmark={b}
            tagsFile={tagsFile}
            {...(onToggleSelect !== undefined
              ? { selected: selected?.has(b.id) ?? false, onToggleSelect }
              : {})}
          />
        ))}
      </ul>
    </div>
  );
}
