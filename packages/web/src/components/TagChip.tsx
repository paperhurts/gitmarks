import type { TagsFile } from "@gitmarks/core";

interface Props {
  name: string;
  tagsFile: TagsFile;
}

const DEFAULT_COLOR = "#475569";
const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

export function TagChip({ name, tagsFile }: Props) {
  const tag = tagsFile.tags[name];
  const rawColor = tag?.color ?? DEFAULT_COLOR;
  const color = COLOR_RE.test(rawColor) ? rawColor : DEFAULT_COLOR;
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-xs"
      style={{ backgroundColor: `${color}30`, color, border: `1px solid ${color}80` }}
    >
      {name}
    </span>
  );
}
