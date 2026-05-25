import type { BookmarksFile } from "@gitmarks/core";
import { updateBookmarks } from "@gitmarks/core";

type Mutator = (file: BookmarksFile) => BookmarksFile;

export function bulkAddTag(ids: string[], tag: string, nowIso: string): Mutator {
  return (file) =>
    updateBookmarks(
      file,
      ids.map((id) => {
        const existing = file.bookmarks.find((b) => b.id === id);
        const tags = existing?.tags ?? [];
        const nextTags = tags.includes(tag) ? tags : [...tags, tag];
        return { id, patch: { tags: nextTags } };
      }),
      nowIso,
    );
}

export function bulkRemoveTag(ids: string[], tag: string, nowIso: string): Mutator {
  return (file) =>
    updateBookmarks(
      file,
      ids.map((id) => {
        const existing = file.bookmarks.find((b) => b.id === id);
        const tags = existing?.tags ?? [];
        return { id, patch: { tags: tags.filter((t) => t !== tag) } };
      }),
      nowIso,
    );
}

export function bulkSetFolder(ids: string[], folder: string, nowIso: string): Mutator {
  return (file) => updateBookmarks(file, ids.map((id) => ({ id, patch: { folder } })), nowIso);
}

export function bulkSoftDelete(ids: string[], nowIso: string): Mutator {
  return (file) =>
    updateBookmarks(file, ids.map((id) => ({ id, patch: { deleted_at: nowIso } })), nowIso);
}

export function bulkRestore(ids: string[], nowIso: string): Mutator {
  return (file) =>
    updateBookmarks(file, ids.map((id) => ({ id, patch: { deleted_at: null } })), nowIso);
}
