import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BookmarksFile, TagsFile } from "@gitmarks/core";
import { TrashList } from "../src/components/TrashList.js";

const tagsFile: TagsFile = { version: 1, tags: {} };

const bookmarksFile: BookmarksFile = {
  version: 1,
  updated_at: "2026-05-25T00:00:00Z",
  bookmarks: [
    {
      id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CA",
      url: "https://gone.example.com/",
      title: "Recently deleted",
      folder: "",
      tags: [],
      added_at: "2026-05-01T00:00:00Z",
      updated_at: "2026-05-20T00:00:00Z",
      added_from: "chrome@minerva",
      deleted_at: "2026-05-20T00:00:00Z",
      notes: null,
    },
    {
      id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CB",
      url: "https://alive.example.com/",
      title: "Still alive",
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

describe("TrashList", () => {
  it("renders only deleted bookmarks within the GC window", () => {
    render(
      <TrashList
        bookmarksFile={bookmarksFile}
        tagsFile={tagsFile}
        nowIso="2026-05-25T00:00:00Z"
        onRestore={vi.fn()}
      />,
    );
    expect(screen.getByText("Recently deleted")).toBeInTheDocument();
    expect(screen.queryByText("Still alive")).not.toBeInTheDocument();
  });

  it("calls onRestore with the bookmark id when its restore button is clicked", async () => {
    const onRestore = vi.fn();
    const user = userEvent.setup();
    render(
      <TrashList
        bookmarksFile={bookmarksFile}
        tagsFile={tagsFile}
        nowIso="2026-05-25T00:00:00Z"
        onRestore={onRestore}
      />,
    );
    await user.click(screen.getByRole("button", { name: /restore recently deleted/i }));
    expect(onRestore).toHaveBeenCalledWith("01HXYZ8K7M9P3RQ2V5W6Z8B0CA");
  });

  it("renders an empty state when no deletes are within the GC window", () => {
    const empty: BookmarksFile = { ...bookmarksFile, bookmarks: [bookmarksFile.bookmarks[1]!] };
    render(
      <TrashList
        bookmarksFile={empty}
        tagsFile={tagsFile}
        nowIso="2026-05-25T00:00:00Z"
        onRestore={vi.fn()}
      />,
    );
    expect(screen.getByText(/trash is empty/i)).toBeInTheDocument();
  });
});
