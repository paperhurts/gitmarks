import { describe, it, expect } from "vitest";
import {
  encodeBase64Utf8,
  decodeBase64Utf8,
} from "../src/github/base64.js";

describe("base64 UTF-8 helpers", () => {
  it("round-trips plain ASCII", () => {
    const s = "hello world";
    expect(decodeBase64Utf8(encodeBase64Utf8(s))).toBe(s);
  });

  it("round-trips UTF-8 (accented chars)", () => {
    const s = "café résumé piñata";
    expect(decodeBase64Utf8(encodeBase64Utf8(s))).toBe(s);
  });

  it("round-trips emoji and CJK", () => {
    const s = "📚 ブックマーク 🇯🇵";
    expect(decodeBase64Utf8(encodeBase64Utf8(s))).toBe(s);
  });

  it("ignores embedded newlines on decode (GitHub wraps base64 at 60 cols)", () => {
    const raw = encodeBase64Utf8("hello");
    const wrapped = raw.slice(0, 4) + "\n" + raw.slice(4);
    expect(decodeBase64Utf8(wrapped)).toBe("hello");
  });
});
