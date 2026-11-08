import type { Bookmark, TagsFile } from "@gitmarks/core";
import { mergeTags } from "@gitmarks/core";

/**
 * Every tag the user has: `tags.json` keys first (their spelling wins), then
 * any tag used on an active bookmark that was never registered in `tags.json`
 * (the popup adds tags to bookmarks without touching `tags.json`).
 */
export function knownTags(
  bookmarks: readonly Bookmark[],
  tagsFile: TagsFile | null,
): string[] {
  const registered = tagsFile == null ? [] : Object.keys(tagsFile.tags);
  const used = bookmarks.filter((b) => b.deleted_at == null).flatMap((b) => b.tags);
  return mergeTags(registered, used);
}

export interface SuggestTagsInput {
  bookmarks: readonly Bookmark[];
  /** From {@link knownTags}. */
  known: readonly string[];
  /** The page being saved. */
  url: string;
  title: string;
  /** Tags already chosen — never suggested again. */
  selected: readonly string[];
  /** Text currently typed in the tag box; narrows suggestions to matches. */
  query?: string;
  limit?: number;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function words(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length >= 3),
  );
}

/**
 * Rank existing tags for the page being saved, entirely locally:
 *  - domain memory: tags on other bookmarks from the same host (+3 each use)
 *  - title keywords: a tag's words appearing in the page title (+2 per word)
 *  - overall popularity as a tie-breaker (+0.1 per use)
 * With a `query`, only tags containing it are returned, prefix matches first.
 */
export function suggestTags(input: SuggestTagsInput): string[] {
  const limit = input.limit ?? 6;
  const selected = new Set(input.selected.map((t) => t.toLowerCase()));
  const query = (input.query ?? "").trim().toLowerCase();
  const host = hostOf(input.url);
  const titleWords = words(input.title);

  const canonical = new Map<string, string>();
  for (const t of input.known) canonical.set(t.toLowerCase(), t);

  const score = new Map<string, number>();
  for (const key of canonical.keys()) score.set(key, 0);
  const bump = (key: string, by: number) => {
    if (score.has(key)) score.set(key, score.get(key)! + by);
  };

  for (const b of input.bookmarks) {
    if (b.deleted_at != null) continue;
    const sameHost = host != null && hostOf(b.url) === host;
    for (const t of b.tags) {
      const key = t.toLowerCase();
      bump(key, 0.1);
      if (sameHost) bump(key, 3);
    }
  }
  for (const key of canonical.keys()) {
    for (const w of words(key)) {
      if (titleWords.has(w)) bump(key, 2);
    }
  }

  return [...canonical.keys()]
    .filter((key) => !selected.has(key))
    .filter((key) => query === "" || key.includes(query))
    .sort((a, b) => {
      if (query !== "") {
        const pa = a.startsWith(query) ? 0 : 1;
        const pb = b.startsWith(query) ? 0 : 1;
        if (pa !== pb) return pa - pb;
      }
      return score.get(b)! - score.get(a)! || a.localeCompare(b);
    })
    .slice(0, limit)
    .map((key) => canonical.get(key)!);
}
