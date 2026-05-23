import type { Bookmark } from "@gitmarks/core";
import { newUlid, normalizeUrl } from "@gitmarks/core";

export interface BuildBookmarkInput {
  url: string;
  title: string;
  machineId: string;
  nowIso: string;
}

export function buildBookmark(input: BuildBookmarkInput): Bookmark {
  return {
    id: newUlid(),
    url: normalizeUrl(input.url),
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
