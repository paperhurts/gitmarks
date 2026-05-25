import type { TagsFile } from "@gitmarks/core";

interface Props {
  name: string;
  tagsFile: TagsFile;
}

const DEFAULT_COLOR = "#475569";

export function TagChip({ name, tagsFile }: Props) {
  const tag = tagsFile.tags[name];
  const color = tag?.color ?? DEFAULT_COLOR;
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-xs"
      style={{ backgroundColor: `${color}30`, color, border: `1px solid ${color}80` }}
    >
      {name}
    </span>
  );
}
