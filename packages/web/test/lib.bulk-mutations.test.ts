import { describe, it, expect } from "vitest";
import type { Bookmark, BookmarksFile } from "@gitmarks/core";
import {
  bulkAddTag,
  bulkRemoveTag,
  bulkSetFolder,
  bulkSoftDelete,
  bulkRestore,
} from "../src/lib/bulk-mutations.js";

function mk(over: Partial<Bookmark> = {}): Bookmark {
  return {
    id: "01HXYZ8K7M9P3RQ2V5W6Z8B0C1",
    url: "https://example.com/",
    title: "Example",
    folder: "",
    tags: [],
    added_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
    added_from: "chrome@minerva",
    deleted_at: null,
    notes: null,
    ...over,
  };
}

const file: BookmarksFile = {
  version: 1,
  updated_at: "2026-05-23T00:00:00Z",
  bookmarks: [
    mk({ id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CA", tags: ["daily"] }),
    mk({ id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CB", tags: ["daily", "to-read"] }),
    mk({ id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CC", tags: [] }),
    mk({ id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CD", deleted_at: "2026-05-20T00:00:00Z" }),
  ],
};

const now = "2026-05-25T00:00:00Z";

describe("bulkAddTag", () => {
  it("adds a tag to each selected bookmark without duplicating", () => {
    const mutator = bulkAddTag(
      ["01HXYZ8K7M9P3RQ2V5W6Z8B0CA", "01HXYZ8K7M9P3RQ2V5W6Z8B0CB", "01HXYZ8K7M9P3RQ2V5W6Z8B0CC"],
      "daily",
      now,
    );
    const next = mutator(file);
    expect(next.bookmarks[0]!.tags).toEqual(["daily"]);
    expect(next.bookmarks[1]!.tags).toEqual(["daily", "to-read"]);
    expect(next.bookmarks[2]!.tags).toEqual(["daily"]);
  });

  it("returned mutator is pure (same input → same output)", () => {
    const mutator = bulkAddTag(["01HXYZ8K7M9P3RQ2V5W6Z8B0CA"], "new", now);
    expect(mutator(file)).toEqual(mutator(file));
  });
});

describe("bulkRemoveTag", () => {
  it("removes the tag from each selected bookmark; no-op when absent", () => {
    const mutator = bulkRemoveTag(
      ["01HXYZ8K7M9P3RQ2V5W6Z8B0CA", "01HXYZ8K7M9P3RQ2V5W6Z8B0CB", "01HXYZ8K7M9P3RQ2V5W6Z8B0CC"],
      "daily",
      now,
    );
    const next = mutator(file);
    expect(next.bookmarks[0]!.tags).toEqual([]);
    expect(next.bookmarks[1]!.tags).toEqual(["to-read"]);
    expect(next.bookmarks[2]!.tags).toEqual([]);
  });
});

describe("bulkSetFolder", () => {
  it("sets folder on each selected bookmark", () => {
    const mutator = bulkSetFolder(
      ["01HXYZ8K7M9P3RQ2V5W6Z8B0CA", "01HXYZ8K7M9P3RQ2V5W6Z8B0CB"],
      "Archive",
      now,
    );
    const next = mutator(file);
    expect(next.bookmarks[0]!.folder).toBe("Archive");
    expect(next.bookmarks[1]!.folder).toBe("Archive");
    expect(next.bookmarks[2]!.folder).toBe("");
  });
});

describe("bulkSoftDelete", () => {
  it("sets deleted_at on each selected bookmark", () => {
    const mutator = bulkSoftDelete(
      ["01HXYZ8K7M9P3RQ2V5W6Z8B0CA", "01HXYZ8K7M9P3RQ2V5W6Z8B0CB"],
      now,
    );
    const next = mutator(file);
    expect(next.bookmarks[0]!.deleted_at).toBe(now);
    expect(next.bookmarks[1]!.deleted_at).toBe(now);
    expect(next.bookmarks[2]!.deleted_at).toBeNull();
  });
});

describe("bulkRestore", () => {
  it("clears deleted_at on each selected bookmark", () => {
    const mutator = bulkRestore(["01HXYZ8K7M9P3RQ2V5W6Z8B0CD"], now);
    const next = mutator(file);
    expect(next.bookmarks[3]!.deleted_at).toBeNull();
    expect(next.bookmarks[3]!.updated_at).toBe(now);
  });

  it("throws via updateBookmarks when an id is missing", () => {
    const mutator = bulkRestore(["01HXYZ8K7M9P3RQ2V5W6Z8B0CZ"], now);
    expect(() => mutator(file)).toThrow(/not found/);
  });
});
