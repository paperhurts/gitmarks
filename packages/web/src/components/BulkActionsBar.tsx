import { useState } from "react";
import type { TagsFile } from "@gitmarks/core";

interface Props {
  count: number;
  tagsFile: TagsFile;
  onAddTag: (tag: string) => Promise<void>;
  onRemoveTag: (tag: string) => Promise<void>;
  onSetFolder: (folder: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onClear: () => void;
}

const inputClass =
  "px-2 py-1 bg-mist border border-fog rounded text-cyan-soft text-sm focus:border-cyan focus:outline-none";
const btnClass =
  "px-3 py-1 rounded bg-fog text-cyan-soft text-sm hover:bg-cyan hover:text-ink disabled:opacity-40";
const dangerClass =
  "px-3 py-1 rounded border border-magenta text-magenta text-sm hover:bg-magenta hover:text-ink";

export function BulkActionsBar({
  count,
  tagsFile,
  onAddTag,
  onRemoveTag,
  onSetFolder,
  onDelete,
  onClear,
}: Props) {
  const [tagToAdd, setTagToAdd] = useState("");
  const [tagToRemove, setTagToRemove] = useState("");
  const [folder, setFolder] = useState("");
  const tagOptions = Object.keys(tagsFile.tags).sort();

  return (
    <div className="border-b border-fog px-4 py-3 bg-mist flex flex-wrap items-center gap-3">
      <span className="text-cyan font-semibold">{count} selected</span>

      <div className="flex items-center gap-1">
        <input
          aria-label="add tag"
          className={inputClass}
          value={tagToAdd}
          onChange={(e) => setTagToAdd(e.target.value)}
          placeholder="tag"
        />
        <button
          type="button"
          className={btnClass}
          disabled={tagToAdd.length === 0}
          onClick={async () => {
            await onAddTag(tagToAdd);
            setTagToAdd("");
          }}
        >
          Add
        </button>
      </div>

      <div className="flex items-center gap-1">
        <select
          aria-label="remove tag"
          className={inputClass}
          value={tagToRemove}
          onChange={(e) => setTagToRemove(e.target.value)}
        >
          <option value="">(pick a tag)</option>
          {tagOptions.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <button
          type="button"
          className={btnClass}
          disabled={tagToRemove.length === 0}
          onClick={async () => {
            await onRemoveTag(tagToRemove);
            setTagToRemove("");
          }}
        >
          Remove
        </button>
      </div>

      <div className="flex items-center gap-1">
        <input
          aria-label="set folder"
          className={inputClass}
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
          placeholder="folder path"
        />
        <button
          type="button"
          className={btnClass}
          disabled={folder.length === 0}
          onClick={async () => {
            await onSetFolder(folder);
            setFolder("");
          }}
        >
          Set
        </button>
      </div>

      <button type="button" className={dangerClass} onClick={() => { void onDelete(); }}>
        Move to trash
      </button>

      <button
        type="button"
        className="ml-auto text-cyan-soft/60 text-sm hover:text-cyan"
        onClick={onClear}
      >
        Clear
      </button>
    </div>
  );
}
