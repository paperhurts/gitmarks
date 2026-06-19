import { factory, type PRNG } from "ulid";

// ulid()'s built-in environment detection (detectPrng/detectRoot) throws
// "secure crypto unusable, insecure Math.random not allowed" in the MV3
// service-worker context under crxjs bundling — which crashes SW registration
// entirely (background reconcile/listeners/poll never run). Bind the PRNG
// explicitly to the Web Crypto API instead. crypto.getRandomValues is present
// in service workers, extension pages (popup/options), the web UI, and Node
// 19+, so ULID generation works everywhere and never falls back to Math.random.
const cryptoPrng: PRNG = () => {
  const bytes = new Uint8Array(1);
  crypto.getRandomValues(bytes);
  return bytes[0]! / 0xff;
};

const generateUlid = factory(cryptoPrng);

export function newUlid(): string {
  return generateUlid();
}
