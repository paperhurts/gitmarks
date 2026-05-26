import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("renders a checkbox per row when onToggleSelect is provided", () => {
    const onToggleSelect = vi.fn();
    render(
      <BookmarkList
        bookmarksFile={bookmarks}
        tagsFile={tags}
        selected={new Set()}
        onToggleSelect={onToggleSelect}
      />,
    );
    const checkboxes = screen.getAllByRole("checkbox");
    // 1 row checkbox + 1 select-all = 2
    expect(checkboxes.length).toBeGreaterThanOrEqual(2);
  });

  it("calls onToggleSelect with the bookmark id when its checkbox is clicked", async () => {
    const user = userEvent.setup();
    const onToggleSelect = vi.fn();
    render(
      <BookmarkList
        bookmarksFile={bookmarks}
        tagsFile={tags}
        selected={new Set()}
        onToggleSelect={onToggleSelect}
      />,
    );
    const rowCheckbox = screen.getByLabelText(/select hacker news/i);
    await user.click(rowCheckbox);
    expect(onToggleSelect).toHaveBeenCalledWith("01HXYZ8K7M9P3RQ2V5W6Z8B0CA");
  });

  it("renders no checkboxes when onToggleSelect is not provided", () => {
    render(<BookmarkList bookmarksFile={bookmarks} tagsFile={tags} />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("renders a plain span (not an anchor) for unsafe URL schemes", () => {
    const danger: BookmarksFile = {
      version: 1,
      updated_at: "2026-05-25T00:00:00Z",
      bookmarks: [
        {
          id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CA",
          url: "javascript:alert(1)",
          title: "Click me",
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
    render(<BookmarkList bookmarksFile={danger} tagsFile={tags} />);
    expect(screen.queryByRole("link", { name: /click me/i })).not.toBeInTheDocument();
    expect(screen.getByText("Click me")).toBeInTheDocument();
  });

  it("falls back to the default color when the tag color is malformed", () => {
    const malformedTags: TagsFile = {
      version: 1,
      tags: { weird: { color: "red; background: url(x)", description: null } },
    };
    const bm: BookmarksFile = {
      version: 1,
      updated_at: "2026-05-25T00:00:00Z",
      bookmarks: [
        {
          id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CA",
          url: "https://example.com/",
          title: "Tagged",
          folder: "",
          tags: ["weird"],
          added_at: "2026-05-01T00:00:00Z",
          updated_at: "2026-05-01T00:00:00Z",
          added_from: "chrome@minerva",
          deleted_at: null,
          notes: null,
        },
      ],
    };
    render(<BookmarkList bookmarksFile={bm} tagsFile={malformedTags} />);
    const chip = screen.getByText("weird");
    // Inline style should reference the fallback #475569, not the attacker payload
    expect(chip).toHaveAttribute("style");
    expect(chip.getAttribute("style") ?? "").not.toContain("url(");
  });
});
