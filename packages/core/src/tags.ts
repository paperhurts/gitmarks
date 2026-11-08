/** Longest tag name (in characters) accepted from user input. */
export const MAX_TAG_LENGTH = 40;

/**
 * Clean a user-typed tag. Commas and control characters become spaces (commas
 * are the popup's chip separator), whitespace runs collapse, ends are trimmed,
 * and the result is capped at {@link MAX_TAG_LENGTH} characters. Case is
 * preserved — tag names are case-sensitive keys in `tags.json`. Returns null
 * when nothing usable is left.
 */
export function normalizeTag(raw: string): string | null {
  const cleaned = raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const capped = Array.from(cleaned).slice(0, MAX_TAG_LENGTH).join("").trim();
  return capped.length === 0 ? null : capped;
}

/**
 * Map `tag` onto an existing spelling from `known` when they match
 * case-insensitively, so typing "rust" reuses an existing "Rust" tag instead of
 * minting a near-duplicate. Returns `tag` unchanged when nothing matches.
 */
export function canonicalTag(tag: string, known: Iterable<string>): string {
  const lower = tag.toLowerCase();
  for (const k of known) {
    if (k.toLowerCase() === lower) return k;
  }
  return tag;
}

/**
 * Case-insensitive union of two tag lists, keeping the first-seen spelling and
 * order (`a` first, then new entries from `b`).
 */
export function mergeTags(a: readonly string[], b: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of [...a, ...b]) {
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}
