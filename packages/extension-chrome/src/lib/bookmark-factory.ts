import type { Bookmark } from "@gitmarks/core";
import { newUlid, normalizeUrl } from "@gitmarks/core";

export interface BuildBookmarkInput {
  url: string;
  title: string;
  machineId: string;
  nowIso: string;
  /** Strip tracking params (utm_, fbclid, gclid, etc.) at save time. Default false. */
  stripTrackingParams?: boolean;
}

export function buildBookmark(input: BuildBookmarkInput): Bookmark {
  return {
    id: newUlid(),
    url: normalizeUrl(input.url, {
      stripTrackingParams: input.stripTrackingParams ?? false,
    }),
    title: input.title,
    folder: "",
    tags: [],
    added_at: input.nowIso,
    updated_at: input.nowIso,
    added_from: `chrome@${input.machineId}`,
    deleted_at: null,
    notes: null,
  };
}
