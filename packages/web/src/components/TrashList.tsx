import type { BookmarksFile, TagsFile } from "@gitmarks/core";
import { TagChip } from "./TagChip.js";
import { deletedBookmarks } from "../lib/data.js";

interface Props {
  bookmarksFile: BookmarksFile;
  tagsFile: TagsFile;
  nowIso: string;
  onRestore: (id: string) => void | Promise<void>;
}

export function TrashList({ bookmarksFile, tagsFile, nowIso, onRestore }: Props) {
  const items = deletedBookmarks(bookmarksFile, nowIso);
  if (items.length === 0) {
    return <p className="p-6 text-cyan-soft/60">Trash is empty.</p>;
  }
  return (
    <ul className="divide-y divide-fog">
      {items.map((b) => (
        <li key={b.id} className="border-b border-fog px-4 py-3 flex items-baseline gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-cyan-soft truncate">{b.title}</div>
            <div className="text-xs text-cyan-soft/40 truncate">{b.url}</div>
            <div className="text-xs text-cyan-soft/60 mt-1">
              deleted {b.deleted_at} · folder {b.folder.length > 0 ? b.folder : "(root)"}
            </div>
            {b.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {b.tags.map((t) => <TagChip key={t} name={t} tagsFile={tagsFile} />)}
              </div>
            )}
          </div>
          <button
            type="button"
            aria-label={`restore ${b.title}`}
            className="px-3 py-1 rounded border border-fog text-cyan-soft hover:border-cyan text-sm"
            onClick={() => { void onRestore(b.id); }}
          >
            Restore
          </button>
        </li>
      ))}
    </ul>
  );
}
