export function normalizeUrl(input: string): string {
  const u = new URL(input);

  if (u.hash && !u.hash.startsWith("#!")) {
    u.hash = "";
  }

  if (u.pathname.length > 1) {
    u.pathname = u.pathname.replace(/\/+$/, "");
  }

  return u.toString();
}
