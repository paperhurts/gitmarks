import { describe, it, expect } from "vitest";
import {
  bookmarkSchema,
  bookmarksFileSchema,
} from "../src/schema/bookmarks.js";
import { tagSchema, tagsFileSchema } from "../src/schema/tags.js";

const validBookmark = {
  id: "01HXYZ8K7M9P3RQ2V5W6Z8B0C1",
  url: "https://example.com/article",
  title: "Article title",
  folder: "Research/AI",
  tags: ["claudepi", "to-read"],
  added_at: "2026-05-23T14:32:11Z",
  updated_at: "2026-05-23T14:32:11Z",
  added_from: "chrome@minerva",
  deleted_at: null,
  notes: null,
};

describe("bookmarkSchema", () => {
  it("accepts a valid bookmark", () => {
    expect(() => bookmarkSchema.parse(validBookmark)).not.toThrow();
  });

  it("rejects a bookmark with a non-ULID id", () => {
    expect(() =>
      bookmarkSchema.parse({ ...validBookmark, id: "not-a-ulid" }),
    ).toThrow();
  });

  it("rejects a bookmark with a malformed URL", () => {
    expect(() =>
      bookmarkSchema.parse({ ...validBookmark, url: "not a url" }),
    ).toThrow();
  });

  it("rejects a bookmark with a non-ISO updated_at", () => {
    expect(() =>
      bookmarkSchema.parse({ ...validBookmark, updated_at: "yesterday" }),
    ).toThrow();
  });

  it("accepts a soft-deleted bookmark", () => {
    expect(() =>
      bookmarkSchema.parse({
        ...validBookmark,
        deleted_at: "2026-06-01T00:00:00Z",
      }),
    ).not.toThrow();
  });

  it("allows an empty folder (root)", () => {
    expect(() =>
      bookmarkSchema.parse({ ...validBookmark, folder: "" }),
    ).not.toThrow();
  });
});

describe("bookmarksFileSchema", () => {
  it("accepts an empty bookmarks file", () => {
    expect(() =>
      bookmarksFileSchema.parse({
        version: 1,
        updated_at: "2026-05-23T14:32:11Z",
        bookmarks: [],
      }),
    ).not.toThrow();
  });

  it("rejects version other than 1", () => {
    expect(() =>
      bookmarksFileSchema.parse({
        version: 2,
        updated_at: "2026-05-23T14:32:11Z",
        bookmarks: [],
      }),
    ).toThrow();
  });
});

describe("tagsFileSchema", () => {
  it("accepts a file with valid tags", () => {
    const file = {
      version: 1,
      tags: {
        claudepi: { color: "#FF00FF", description: "ClaudePi research" },
        "to-read": { color: "#00FFFF", description: null },
      },
    };
    expect(() => tagsFileSchema.parse(file)).not.toThrow();
  });

  it("rejects a tag with a malformed color", () => {
    expect(() =>
      tagSchema.parse({ color: "fuchsia", description: null }),
    ).toThrow();
  });
});
