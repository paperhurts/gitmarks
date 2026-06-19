// Minimal ULID generator: 48-bit millisecond timestamp + 80 bits of randomness,
// Crockford base32, 26 chars, lexicographically sortable by creation time.
//
// We deliberately do NOT use the `ulid` npm package. Its module top level runs
// `export const ulid = factory()`, which eagerly probes for a secure PRNG and
// THROWS "secure crypto unusable, insecure Math.random not allowed" under
// crxjs's MV3 service-worker bundling — the throw fires the moment the module is
// imported, crashing service-worker registration (so reconcile/listeners/poll
// never run; see issue #57). Implementing it here against the Web Crypto API
// (present in the SW, extension pages, the web UI, and Node 19+) avoids that
// fragile environment detection entirely.

const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32 (no I, L, O, U)
const ENCODING_LEN = ENCODING.length; // 32
const TIME_LEN = 10;
const RANDOM_LEN = 16;

function encodeTime(nowMs: number): string {
  let now = nowMs;
  let str = "";
  for (let i = 0; i < TIME_LEN; i++) {
    const mod = now % ENCODING_LEN;
    str = ENCODING[mod]! + str;
    now = Math.floor(now / ENCODING_LEN);
  }
  return str;
}

function encodeRandom(): string {
  const bytes = new Uint8Array(RANDOM_LEN);
  crypto.getRandomValues(bytes);
  let str = "";
  // 256 is an exact multiple of 32, so `byte % 32` is uniform (no modulo bias).
  for (let i = 0; i < RANDOM_LEN; i++) {
    str += ENCODING[bytes[i]! % ENCODING_LEN]!;
  }
  return str;
}

export function newUlid(): string {
  return encodeTime(Date.now()) + encodeRandom();
}
