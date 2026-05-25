import { describe, it, expect } from "vitest";
import type { TagsFile } from "@gitmarks/core";
import { addTag, deleteTag, renameTag, setTagColor } from "../src/lib/tag-mutations.js";

const file: TagsFile = {
  version: 1,
  tags: {
    daily: { color: "#00FFFF", description: "open every morning" },
    "to-read": { color: "#FFFF00", description: null },
  },
};

describe("addTag", () => {
  it("adds a new tag", () => {
    const next = addTag(file, "reference", "#00FF88", "docs and refs");
    expect(next.tags["reference"]).toEqual({ color: "#00FF88", description: "docs and refs" });
  });

  it("does not mutate the input", () => {
    addTag(file, "reference", "#00FF88", null);
    expect(file.tags["reference"]).toBeUndefined();
  });

  it("throws when adding a tag that already exists", () => {
    expect(() => addTag(file, "daily", "#FF0000", null)).toThrow(/already exists/);
  });

  it("rejects invalid color format", () => {
    expect(() => addTag(file, "x", "red", null)).toThrow(/color/i);
  });

  it("rejects empty name", () => {
    expect(() => addTag(file, "", "#FFFFFF", null)).toThrow(/name/i);
  });
});

describe("setTagColor", () => {
  it("updates the color of an existing tag", () => {
    const next = setTagColor(file, "daily", "#123456");
    expect(next.tags["daily"]?.color).toBe("#123456");
    expect(next.tags["daily"]?.description).toBe("open every morning");
  });

  it("throws when the tag doesn't exist", () => {
    expect(() => setTagColor(file, "missing", "#FFFFFF")).toThrow(/not found/);
  });

  it("rejects invalid color format", () => {
    expect(() => setTagColor(file, "daily", "purple")).toThrow(/color/i);
  });
});

describe("renameTag", () => {
  it("renames a tag entry", () => {
    const next = renameTag(file, "to-read", "queue");
    expect(next.tags["queue"]).toEqual(file.tags["to-read"]);
    expect(next.tags["to-read"]).toBeUndefined();
  });

  it("does not mutate the input", () => {
    renameTag(file, "to-read", "queue");
    expect(file.tags["to-read"]).toBeDefined();
  });

  it("throws when source doesn't exist", () => {
    expect(() => renameTag(file, "missing", "x")).toThrow(/not found/);
  });

  it("throws when destination already exists", () => {
    expect(() => renameTag(file, "daily", "to-read")).toThrow(/already exists/);
  });

  it("no-ops when old and new names are identical", () => {
    expect(renameTag(file, "daily", "daily")).toEqual(file);
  });
});

describe("deleteTag", () => {
  it("removes a tag entry", () => {
    const next = deleteTag(file, "daily");
    expect(next.tags["daily"]).toBeUndefined();
    expect(next.tags["to-read"]).toBeDefined();
  });

  it("throws when the tag doesn't exist", () => {
    expect(() => deleteTag(file, "missing")).toThrow(/not found/);
  });

  it("does not mutate the input", () => {
    deleteTag(file, "daily");
    expect(file.tags["daily"]).toBeDefined();
  });
});
