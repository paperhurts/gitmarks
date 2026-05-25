import { describe, it, expect } from "vitest";
import type { BookmarksFile } from "@gitmarks/core";
import { toNetscapeHtml } from "../src/lib/netscape-export.js";

const file: BookmarksFile = {
  version: 1,
  updated_at: "2026-05-25T00:00:00Z",
  bookmarks: [
    {
      id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CA",
      url: "https://news.ycombinator.com/",
      title: "Hacker News",
      folder: "",
      tags: ["daily"],
      added_at: "2026-05-01T08:00:00Z",
      updated_at: "2026-05-01T08:00:00Z",
      added_from: "chrome@minerva",
      deleted_at: null,
      notes: null,
    },
    {
      id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CB",
      url: "https://arxiv.org/abs/2310.00001",
      title: "Paper",
      folder: "Research/AI",
      tags: ["to-read"],
      added_at: "2026-05-02T09:00:00Z",
      updated_at: "2026-05-02T09:00:00Z",
      added_from: "firefox@minerva",
      deleted_at: null,
      notes: null,
    },
    {
      id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CC",
      url: "https://example.com/deleted",
      title: "Gone",
      folder: "",
      tags: [],
      added_at: "2026-04-01T00:00:00Z",
      updated_at: "2026-05-10T00:00:00Z",
      added_from: "chrome@minerva",
      deleted_at: "2026-05-10T00:00:00Z",
      notes: null,
    },
  ],
};

describe("toNetscapeHtml", () => {
  it("emits the canonical Netscape DOCTYPE", () => {
    const html = toNetscapeHtml(file);
    expect(html).toContain("<!DOCTYPE NETSCAPE-Bookmark-file-1>");
    expect(html).toContain("<TITLE>Bookmarks</TITLE>");
  });

  it("renders each non-deleted bookmark as <DT><A>", () => {
    const html = toNetscapeHtml(file);
    expect(html).toContain('<A HREF="https://news.ycombinator.com/"');
    expect(html).toContain(">Hacker News</A>");
    expect(html).toContain('<A HREF="https://arxiv.org/abs/2310.00001"');
  });

  it("skips tombstoned bookmarks", () => {
    const html = toNetscapeHtml(file);
    expect(html).not.toContain("https://example.com/deleted");
  });

  it("nests folder bookmarks under <H3> headings with <DL>", () => {
    const html = toNetscapeHtml(file);
    expect(html).toMatch(/<H3[^>]*>Research<\/H3>[\s\S]*<H3[^>]*>AI<\/H3>/);
  });

  it("escapes HTML-sensitive characters in titles and URLs", () => {
    const dangerous: BookmarksFile = {
      version: 1,
      updated_at: "2026-05-25T00:00:00Z",
      bookmarks: [
        {
          id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CA",
          url: "https://example.com/?a=1&b=2",
          title: '<script>alert("x")</script>',
          folder: "",
          tags: [],
          added_at: "2026-05-01T00:00:00Z",
          updated_at: "2026-05-01T00:00:00Z",
          added_from: "chrome@minerva",
          deleted_at: null,
          notes: null,
        },
      ],
    };
    const html = toNetscapeHtml(dangerous);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
  });

  it("includes ADD_DATE attribute when added_at is parseable", () => {
    const html = toNetscapeHtml(file);
    const expectedEpoch = Math.floor(new Date("2026-05-01T08:00:00Z").getTime() / 1000);
    expect(html).toContain(`ADD_DATE="${expectedEpoch}"`);
  });

  it("emits TAGS attribute when bookmark has tags", () => {
    const html = toNetscapeHtml(file);
    expect(html).toContain('TAGS="daily"');
    expect(html).toContain('TAGS="to-read"');
  });
});
