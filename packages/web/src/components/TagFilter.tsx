import type { TagsFile } from "@gitmarks/core";

interface Props {
  used: Set<string>;
  tagsFile: TagsFile;
  selected: string | null;
  onSelect: (name: string | null) => void;
}

const DEFAULT_COLOR = "#475569";

export function TagFilter({ used, tagsFile, selected, onSelect }: Props) {
  const names = [...used].sort();
  if (names.length === 0) {
    return <p className="text-cyan-soft/50 text-sm">no tags in use</p>;
  }
  return (
    <ul className="space-y-1">
      {names.map((name) => {
        const color = tagsFile.tags[name]?.color ?? DEFAULT_COLOR;
        const isSelected = selected === name;
        return (
          <li key={name}>
            <button
              type="button"
              onClick={() => onSelect(isSelected ? null : name)}
              className={`w-full text-left px-2 py-1 rounded text-sm ${
                isSelected ? "bg-fog" : "hover:bg-mist"
              }`}
              style={{ color }}
            >
              {name}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
