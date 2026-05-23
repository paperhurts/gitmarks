import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { bookmarksFileSchema } from "../src/schema/bookmarks.js";
import { tagsFileSchema } from "../src/schema/tags.js";
import {
  addBookmark,
  gcTombstones,
  softDeleteBookmark,
} from "../src/mutate.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = resolve(here, "../../../examples/example-bookmarks-repo");

async function loadJson<T>(name: string): Promise<T> {
  const raw = await readFile(resolve(fixturesRoot, name), "utf8");
  return JSON.parse(raw) as T;
}

describe("example fixtures", () => {
  it("bookmarks.json matches the schema", async () => {
    const data = await loadJson("bookmarks.json");
    expect(() => bookmarksFileSchema.parse(data)).not.toThrow();
  });

  it("tags.json matches the schema", async () => {
    const data = await loadJson("tags.json");
    expect(() => tagsFileSchema.parse(data)).not.toThrow();
  });

  it("supports a full add → delete → gc cycle", async () => {
    const initial = bookmarksFileSchema.parse(
      await loadJson("bookmarks.json"),
    );

    const added = addBookmark(
      initial,
      {
        id: "01HZZZ0000000000000000000A",
        url: "https://example.com/added",
        title: "Added",
        folder: "",
        tags: [],
        added_at: "2026-05-23T00:00:00Z",
        updated_at: "2026-05-23T00:00:00Z",
        added_from: "chrome@test",
        deleted_at: null,
        notes: null,
      },
      "2026-05-23T00:00:00Z",
    );
    expect(added.bookmarks.length).toBe(initial.bookmarks.length + 1);

    const deleted = softDeleteBookmark(
      added,
      "01HZZZ0000000000000000000A",
      "2026-05-23T00:01:00Z",
    );
    expect(
      deleted.bookmarks.find((b) => b.id === "01HZZZ0000000000000000000A")
        ?.deleted_at,
    ).toBe("2026-05-23T00:01:00Z");

    const gced = gcTombstones(deleted, 30, "2026-07-01T00:00:00Z");
    expect(
      gced.bookmarks.some((b) => b.id === "01HZZZ0000000000000000000A"),
    ).toBe(false);
    expect(
      gced.bookmarks.some((b) => b.id === "01HXYZ8K7M9P3RQ2V5W6Z8B0CA"),
    ).toBe(false);
  });
});
