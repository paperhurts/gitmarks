import { describe, it, expect } from "vitest";
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
});
