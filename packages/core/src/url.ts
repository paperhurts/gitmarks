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
