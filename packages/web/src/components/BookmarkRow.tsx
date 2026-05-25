import type { Bookmark, TagsFile } from "@gitmarks/core";
import { TagChip } from "./TagChip.js";

interface Props {
  bookmark: Bookmark;
  tagsFile: TagsFile;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}

export function BookmarkRow({ bookmark, tagsFile, selected, onToggleSelect }: Props) {
  const folder = bookmark.folder.length > 0 ? bookmark.folder : "(root)";
  const showCheckbox = onToggleSelect !== undefined;
  return (
    <li className="border-b border-fog px-4 py-3 hover:bg-mist transition-colors flex gap-3">
      {showCheckbox && (
        <input
          type="checkbox"
          aria-label={`select ${bookmark.title}`}
          checked={selected ?? false}
          onChange={() => onToggleSelect(bookmark.id)}
          className="mt-1.5"
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-3">
          <a
            href={bookmark.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan hover:text-magenta truncate flex-1"
          >
            {bookmark.title}
          </a>
          <span className="text-xs text-cyan-soft/60">{folder}</span>
        </div>
        <div className="text-xs text-cyan-soft/40 truncate mt-1">{bookmark.url}</div>
        {bookmark.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {bookmark.tags.map((t) => (
              <TagChip key={t} name={t} tagsFile={tagsFile} />
            ))}
          </div>
        )}
        {bookmark.notes != null && (
          <p className="text-xs text-cyan-soft/70 italic mt-1">{bookmark.notes}</p>
        )}
      </div>
    </li>
  );
}
