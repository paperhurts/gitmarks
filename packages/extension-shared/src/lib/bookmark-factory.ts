import type { Bookmark } from "@gitmarks/core";
import { newUlid, normalizeUrl, isSafeBookmarkUrl, normalizeTag, mergeTags } from "@gitmarks/core";

export interface BuildBookmarkInput {
  url: string;
  title: string;
  machineId: string;
  nowIso: string;
  /** Strip tracking params (utm_, fbclid, gclid, etc.) at save time. Default false. */
  stripTrackingParams?: boolean;
  /** Folder path to place the bookmark in (e.g. "Session 2026-06-13"). Default "" (root). */
  folder?: string;
  /** Tags to attach; each is run through normalizeTag and de-duped case-insensitively. */
  tags?: readonly string[];
}

/** normalizeTag every entry, drop empties, de-dupe case-insensitively. */
export function cleanTags(tags: readonly string[]): string[] {
  const cleaned = tags.map(normalizeTag).filter((t): t is string => t != null);
  return mergeTags(cleaned, []);
}

export function buildBookmark(input: BuildBookmarkInput): Bookmark {
  if (!isSafeBookmarkUrl(input.url)) {
    throw new Error(`Refusing to save bookmark with unsafe URL scheme: ${input.url}`);
  }
  return {
    id: newUlid(),
    url: normalizeUrl(input.url, {
      stripTrackingParams: input.stripTrackingParams ?? false,
    }),
    title: input.title,
    folder: input.folder ?? "",
    tags: cleanTags(input.tags ?? []),
    added_at: input.nowIso,
    updated_at: input.nowIso,
    added_from: `chrome@${input.machineId}`,
    deleted_at: null,
    notes: null,
  };
}
