import { useEffect, useRef, useState } from "react";
import type { TagsFile } from "@gitmarks/core";
import { addTag, deleteTag, renameTag, setTagColor } from "../lib/tag-mutations.js";

type Mutator = (file: TagsFile) => TagsFile;

interface Props {
  tagsFile: TagsFile;
  onMutate: (mutator: Mutator) => Promise<void>;
}

export function TagManager({ tagsFile, onMutate }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  async function safeMutate(mutator: Mutator): Promise<void> {
    setError(null);
    try {
      mutator(tagsFile);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }
    await onMutate(mutator);
  }

  return (
    <div className="p-4 space-y-2">
      <h1 className="text-magenta text-2xl mb-4">Tags</h1>
      <p className="text-cyan-soft/60 text-xs mb-2">
        Renaming a tag updates tags.json only; existing bookmarks still reference the old name.
      </p>
      {error && <p className="text-magenta">{error}</p>}

      <ul className="space-y-2">
        {Object.entries(tagsFile.tags).map(([name, tag]) => (
          <TagRow
            key={name}
            name={name}
            color={tag.color}
            onRename={(next) => safeMutate((f) => renameTag(f, name, next))}
            onColor={(next) => safeMutate((f) => setTagColor(f, name, next))}
            onDelete={() => safeMutate((f) => deleteTag(f, name))}
          />
        ))}
      </ul>

      <div className="flex gap-2 pt-4 border-t border-fog">
        <label className="flex-1">
          <span className="sr-only">new tag name</span>
          <input
            aria-label="new tag name"
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full px-3 py-2 bg-mist border border-fog rounded text-cyan-soft focus:border-cyan focus:outline-none"
            placeholder="new tag name"
          />
        </label>
        <button
          type="button"
          className="px-4 py-2 rounded bg-cyan text-ink font-semibold hover:bg-cyan-soft disabled:opacity-40"
          disabled={newName.length === 0}
          onClick={async () => {
            await safeMutate((f) => addTag(f, newName, "#22d3ee", null));
            setNewName("");
          }}
        >
          Add tag
        </button>
      </div>
    </div>
  );
}

interface RowProps {
  name: string;
  color: string;
  onRename: (next: string) => Promise<void>;
  onColor: (next: string) => Promise<void>;
  onDelete: () => Promise<void>;
}

function TagRow({ name, color, onRename, onColor, onDelete }: RowProps) {
  const [draft, setDraft] = useState(name);
  const colorRef = useRef<HTMLInputElement>(null);
  const onColorRef = useRef(onColor);
  onColorRef.current = onColor;

  // Attach a native change listener so that direct `.value` assignment + dispatchEvent
  // works in tests without relying on React's value-change tracking (which skips onChange
  // when `.value` is set programmatically before dispatch).
  useEffect(() => {
    const el = colorRef.current;
    if (!el) return;
    function handleChange() {
      void onColorRef.current(el!.value);
    }
    el.addEventListener("change", handleChange);
    return () => { el.removeEventListener("change", handleChange); };
  }, []);

  return (
    <li className="flex items-center gap-2">
      <input
        ref={colorRef}
        type="color"
        aria-label={`color for ${name}`}
        defaultValue={color}
        className="w-8 h-8 bg-transparent border border-fog rounded cursor-pointer"
      />
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { if (draft !== name) void onRename(draft); }}
        className="flex-1 px-3 py-2 bg-mist border border-fog rounded text-cyan-soft focus:border-cyan focus:outline-none"
      />
      <button
        type="button"
        aria-label={`delete ${name}`}
        onClick={() => { void onDelete(); }}
        className="px-3 py-2 rounded border border-fog text-magenta hover:border-magenta"
      >
        Delete
      </button>
    </li>
  );
}
