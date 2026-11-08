import type { Bookmark, BookmarksFile } from "@gitmarks/core";
import { normalizeUrl, updateBookmarks } from "@gitmarks/core";

type Mutator = (file: BookmarksFile) => BookmarksFile;

export interface DuplicateSummary {
  /** Distinct URLs that have more than one active entry. */
  urls: number;
  /** Active entries that would be moved to trash (all but one per URL). */
  extra: number;
}

function urlKey(url: string): string {
  try {
    return normalizeUrl(url);
  } catch {
    return url;
  }
}

/**
 * Active bookmarks grouped by normalized URL, in file order. The first entry
 * of each group is the keeper — the same one the extension's reconcile maps
 * to the local bookmark, so devices keep their existing node.
 */
function groups(file: BookmarksFile): Map<string, Bookmark[]> {
  const out = new Map<string, Bookmark[]>();
  for (const b of file.bookmarks) {
    if (b.deleted_at != null) continue;
    const k = urlKey(b.url);
    const g = out.get(k);
    if (g == null) out.set(k, [b]);
    else g.push(b);
  }
  return out;
}

export function findDuplicates(file: BookmarksFile): DuplicateSummary {
  let urls = 0;
  let extra = 0;
  for (const g of groups(file).values()) {
    if (g.length > 1) {
      urls++;
      extra += g.length - 1;
    }
  }
  return { urls, extra };
}

function unionTags(lists: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const t of list) {
      const k = t.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(t);
    }
  }
  return out;
}

/**
 * Collapse duplicate active entries (same normalized URL) into the first one.
 * The keeper gains the union of all tags and the first non-empty notes; the
 * rest are soft-deleted (tombstones), so every device's next poll removes its
 * local copies and the 30-day GC eventually drops them from the file.
 *
 * Pure: safe to replay inside client.update on a 409.
 */
export function dedupeBookmarks(nowIso: string): Mutator {
  return (file) => {
    const patches: Array<{ id: string; patch: Partial<Omit<Bookmark, "id">> }> = [];
    for (const g of groups(file).values()) {
      if (g.length < 2) continue;
      const [keeper, ...rest] = g as [Bookmark, ...Bookmark[]];
      const tags = unionTags(g.map((b) => b.tags));
      const notes = keeper.notes ?? rest.find((b) => b.notes != null && b.notes !== "")?.notes ?? null;
      const tagsChanged = tags.length !== keeper.tags.length;
      if (tagsChanged || notes !== keeper.notes) {
        patches.push({ id: keeper.id, patch: { tags, notes } });
      }
      for (const b of rest) patches.push({ id: b.id, patch: { deleted_at: nowIso } });
    }
    return updateBookmarks(file, patches, nowIso);
  };
}
