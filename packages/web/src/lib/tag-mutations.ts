import type { TagsFile } from "@gitmarks/core";

const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

function assertColor(color: string): void {
  if (!COLOR_RE.test(color)) {
    throw new Error(`invalid color (expected #RRGGBB, got "${color}")`);
  }
}

function assertName(name: string): void {
  if (name.length === 0) throw new Error("tag name must not be empty");
}

export function addTag(
  file: TagsFile,
  name: string,
  color: string,
  description: string | null,
): TagsFile {
  assertName(name);
  assertColor(color);
  if (file.tags[name] !== undefined) {
    throw new Error(`tag "${name}" already exists`);
  }
  return { ...file, tags: { ...file.tags, [name]: { color, description } } };
}

export function setTagColor(file: TagsFile, name: string, color: string): TagsFile {
  assertColor(color);
  const existing = file.tags[name];
  if (existing === undefined) throw new Error(`tag "${name}" not found`);
  return {
    ...file,
    tags: { ...file.tags, [name]: { ...existing, color } },
  };
}

export function renameTag(file: TagsFile, oldName: string, newName: string): TagsFile {
  if (oldName === newName) return file;
  assertName(newName);
  const existing = file.tags[oldName];
  if (existing === undefined) throw new Error(`tag "${oldName}" not found`);
  if (file.tags[newName] !== undefined) {
    throw new Error(`tag "${newName}" already exists`);
  }
  const next = { ...file.tags };
  delete next[oldName];
  next[newName] = existing;
  return { ...file, tags: next };
}

export function deleteTag(file: TagsFile, name: string): TagsFile {
  if (file.tags[name] === undefined) throw new Error(`tag "${name}" not found`);
  const next = { ...file.tags };
  delete next[name];
  return { ...file, tags: next };
}
