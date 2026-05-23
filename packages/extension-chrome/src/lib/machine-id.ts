const KEY = "gitmarks:machineId";
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32

function newId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET.charAt(b & 31);
  return out;
}

export async function getMachineId(): Promise<string> {
  const stored = await chrome.storage.local.get(KEY);
  const existing = stored[KEY];
  if (typeof existing === "string" && /^[0-9A-HJKMNP-TV-Z]{8}$/.test(existing)) {
    return existing;
  }
  const fresh = newId();
  await chrome.storage.local.set({ [KEY]: fresh });
  return fresh;
}
