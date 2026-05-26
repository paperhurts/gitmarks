// Schemes a browser opens in a tab as a regular navigation. Anything outside
// this allowlist (javascript:, data:, vbscript:, etc.) is rejected at save time
// and rendered as plain text (no clickable anchor) at render time. Defense in
// depth against a malicious bookmarks.json commit; an attacker who lands a
// javascript: URL would otherwise execute in the origin holding the PAT.
const SAFE_URL_SCHEMES = new Set([
  "http:",
  "https:",
  "mailto:",
  "ftp:",
  "ftps:",
  "chrome:",
  "about:",
  "moz-extension:",
  "chrome-extension:",
  "view-source:",
]);

export function isSafeBookmarkUrl(input: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return false;
  }
  return SAFE_URL_SCHEMES.has(parsed.protocol);
}

// Well-known tracking parameter names. Compared case-insensitively.
// Sources: utm_* (Google Analytics), fbclid (Facebook), gclid (Google Ads),
// msclkid (Microsoft Ads), mc_cid/mc_eid (Mailchimp).
const TRACKING_PARAM_PREFIXES = ["utm_"];
const TRACKING_PARAM_EXACT = new Set([
  "fbclid",
  "gclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
]);

function isTrackingParam(name: string): boolean {
  const lower = name.toLowerCase();
  if (TRACKING_PARAM_EXACT.has(lower)) return true;
  return TRACKING_PARAM_PREFIXES.some((p) => lower.startsWith(p));
}

export interface NormalizeUrlOptions {
  /** Strip well-known tracking params (utm_*, fbclid, gclid, msclkid, mc_*). Default false. */
  stripTrackingParams?: boolean;
}

export function normalizeUrl(input: string, opts: NormalizeUrlOptions = {}): string {
  const u = new URL(input);

  if (u.hash && !u.hash.startsWith("#!")) {
    u.hash = "";
  }

  if (u.pathname.length > 1) {
    u.pathname = u.pathname.replace(/\/+$/, "");
  }

  if (opts.stripTrackingParams) {
    const keysToDelete: string[] = [];
    for (const name of u.searchParams.keys()) {
      if (isTrackingParam(name)) keysToDelete.push(name);
    }
    for (const name of keysToDelete) u.searchParams.delete(name);
  }

  return u.toString();
}
