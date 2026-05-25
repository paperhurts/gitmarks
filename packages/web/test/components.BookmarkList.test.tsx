import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { BookmarksFile, TagsFile } from "@gitmarks/core";
import { BookmarkList } from "../src/components/BookmarkList.js";

const bookmarks: BookmarksFile = {
  version: 1,
  updated_at: "2026-05-23T00:00:00Z",
  bookmarks: [
    {
      id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CA",
      url: "https://news.ycombinator.com/",
      title: "Hacker News",
      folder: "",
      tags: ["daily"],
      added_at: "2026-05-01T00:00:00Z",
      updated_at: "2026-05-01T00:00:00Z",
      added_from: "chrome@minerva",
      deleted_at: null,
      notes: null,
    },
    {
      id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CB",
      url: "https://gone.example.com/",
      title: "Deleted",
      folder: "",
      tags: [],
      added_at: "2026-05-01T00:00:00Z",
      updated_at: "2026-05-10T00:00:00Z",
      added_from: "chrome@minerva",
      deleted_at: "2026-05-10T00:00:00Z",
      notes: null,
    },
  ],
};

const tags: TagsFile = {
  version: 1,
  tags: { daily: { color: "#00FFFF", description: null } },
};

describe("BookmarkList", () => {
  it("renders one row per non-deleted bookmark", () => {
    render(<BookmarkList bookmarksFile={bookmarks} tagsFile={tags} />);
    expect(screen.getByText("Hacker News")).toBeInTheDocument();
    expect(screen.queryByText("Deleted")).not.toBeInTheDocument();
  });

  it("renders the URL as an external link", () => {
    render(<BookmarkList bookmarksFile={bookmarks} tagsFile={tags} />);
    const link = screen.getByRole("link", { name: /hacker news/i });
    expect(link).toHaveAttribute("href", "https://news.ycombinator.com/");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders a tag chip per tag", () => {
    render(<BookmarkList bookmarksFile={bookmarks} tagsFile={tags} />);
    expect(screen.getByText("daily")).toBeInTheDocument();
  });

  it("renders an empty state when there are no visible bookmarks", () => {
    const empty: BookmarksFile = { version: 1, updated_at: "now", bookmarks: [] };
    render(<BookmarkList bookmarksFile={empty} tagsFile={tags} />);
    expect(screen.getByText(/no bookmarks yet/i)).toBeInTheDocument();
  });
});
