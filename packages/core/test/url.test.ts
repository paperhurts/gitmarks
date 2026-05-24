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

  describe("stripTrackingParams option", () => {
    it("default (off): preserves utm_* params", () => {
      expect(normalizeUrl("https://example.com/?utm_source=foo")).toBe(
        "https://example.com/?utm_source=foo",
      );
    });

    it("with stripTrackingParams: removes utm_* params", () => {
      expect(
        normalizeUrl("https://example.com/?utm_source=foo&utm_medium=bar", {
          stripTrackingParams: true,
        }),
      ).toBe("https://example.com/");
    });

    it("with stripTrackingParams: removes fbclid, gclid, msclkid, mc_*", () => {
      expect(
        normalizeUrl("https://example.com/?fbclid=a&gclid=b&msclkid=c&mc_cid=d&mc_eid=e", {
          stripTrackingParams: true,
        }),
      ).toBe("https://example.com/");
    });

    it("with stripTrackingParams: preserves non-tracking params", () => {
      expect(
        normalizeUrl("https://example.com/?utm_source=foo&q=real&page=2", {
          stripTrackingParams: true,
        }),
      ).toBe("https://example.com/?q=real&page=2");
    });

    it("with stripTrackingParams: ignores parameter case (utm_Source treated as tracking)", () => {
      expect(
        normalizeUrl("https://example.com/?UTM_SOURCE=foo&Utm_Medium=bar", {
          stripTrackingParams: true,
        }),
      ).toBe("https://example.com/");
    });

    it("stripping leaves an empty query string off the URL", () => {
      expect(
        normalizeUrl("https://example.com/path?utm_source=x", {
          stripTrackingParams: true,
        }),
      ).toBe("https://example.com/path");
    });
  });
});
