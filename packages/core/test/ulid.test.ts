import { describe, it, expect, vi } from "vitest";
import { newUlid } from "../src/ulid.js";

describe("newUlid", () => {
  it("returns a 26-character Crockford base32 string", () => {
    const id = newUlid();
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("produces unique values", () => {
    const a = newUlid();
    const b = newUlid();
    expect(a).not.toBe(b);
  });

  it("sorts lexicographically by creation time", async () => {
    const a = newUlid();
    await new Promise((r) => setTimeout(r, 2));
    const b = newUlid();
    expect([b, a].sort()).toEqual([a, b]);
  });

  // Regression: ulid()'s env auto-detection threw "secure crypto unusable…" and
  // crashed the MV3 service worker. We now bind the PRNG to Web Crypto, so
  // newUlid must work without ulid touching the global environment.
  it("uses Web Crypto and never hits the insecure-PRNG throw path", () => {
    const spy = vi.spyOn(globalThis.crypto, "getRandomValues");
    expect(() => newUlid()).not.toThrow();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
