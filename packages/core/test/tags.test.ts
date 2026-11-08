import { describe, it, expect } from "vitest";
import { normalizeTag, canonicalTag, mergeTags, MAX_TAG_LENGTH } from "../src/index.js";

describe("normalizeTag", () => {
  it("trims and collapses whitespace, preserving case", () => {
    expect(normalizeTag("  Machine   Learning ")).toBe("Machine Learning");
  });

  it("turns commas and control characters into spaces", () => {
    expect(normalizeTag("a,b")).toBe("a b");
    expect(normalizeTag("x\ty\nz")).toBe("x y z");
  });

  it("returns null for empty or separator-only input", () => {
    expect(normalizeTag("")).toBeNull();
    expect(normalizeTag("  ,, \n")).toBeNull();
  });

  it("caps length without splitting surrogate pairs", () => {
    const long = "🦀".repeat(MAX_TAG_LENGTH + 5);
    const out = normalizeTag(long)!;
    expect(Array.from(out)).toHaveLength(MAX_TAG_LENGTH);
    expect(out).toBe("🦀".repeat(MAX_TAG_LENGTH));
  });
});

describe("canonicalTag", () => {
  it("reuses an existing spelling case-insensitively", () => {
    expect(canonicalTag("rust", ["dev", "Rust"])).toBe("Rust");
  });

  it("returns the input when unknown", () => {
    expect(canonicalTag("new", ["dev"])).toBe("new");
  });
});

describe("mergeTags", () => {
  it("unions case-insensitively, keeping first spelling and order", () => {
    expect(mergeTags(["Rust", "dev"], ["rust", "docs", "DEV"])).toEqual(["Rust", "dev", "docs"]);
  });
});
