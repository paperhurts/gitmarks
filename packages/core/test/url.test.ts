import { describe, it, expect } from "vitest";
import { normalizeUrl } from "../src/url.js";

describe("normalizeUrl", () => {
  it("preserves a clean URL unchanged (modulo WHATWG normalization)", () => {
    expect(normalizeUrl("https://example.com/path")).toBe(
      "https://example.com/path",
    );
  });

  it("strips a trailing slash from a non-root path", () => {
    expect(normalizeUrl("https://example.com/path/")).toBe(
      "https://example.com/path",
    );
  });

  it("collapses multiple trailing slashes", () => {
    expect(normalizeUrl("https://example.com/path///")).toBe(
      "https://example.com/path",
    );
  });

  it("keeps the root slash", () => {
    expect(normalizeUrl("https://example.com/")).toBe("https://example.com/");
  });

  it("drops a non-hashbang fragment", () => {
    expect(normalizeUrl("https://example.com/page#section")).toBe(
      "https://example.com/page",
    );
  });

  it("keeps a hashbang fragment", () => {
    expect(normalizeUrl("https://example.com/#!route")).toBe(
      "https://example.com/#!route",
    );
  });

  it("keeps AngularJS-style hashbang routes", () => {
    expect(normalizeUrl("https://example.com/#!/route/sub")).toBe(
      "https://example.com/#!/route/sub",
    );
  });

  it("preserves the query string", () => {
    expect(normalizeUrl("https://example.com/path/?q=hi&p=2")).toBe(
      "https://example.com/path?q=hi&p=2",
    );
  });

  it("lowercases the host", () => {
    expect(normalizeUrl("HTTPS://Example.COM/Path")).toBe(
      "https://example.com/Path",
    );
  });

  it("throws on an invalid URL", () => {
    expect(() => normalizeUrl("not a url")).toThrow();
  });
});
