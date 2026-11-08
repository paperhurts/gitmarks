import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { Bookmark, BookmarksFile, GitHubClient, TagsFile } from "@gitmarks/core";
import { TrashPage } from "../src/routes/TrashPage.js";

const T = "2026-05-01T00:00:00Z";
const bm = (id: string, deleted_at: string | null): Bookmark => ({
  id, url: `https://x.example/${id}`, title: id, folder: "", tags: [], added_at: T,
  updated_at: T, added_from: "chrome@AAAAAAAA", deleted_at, notes: null,
});
const tagsFile: TagsFile = { version: 1, tags: {} };

function setup(bookmarks: Bookmark[]) {
  const file: BookmarksFile = { version: 1, updated_at: T, bookmarks };
  let written: BookmarksFile | null = null;
  const client = {
    read: vi.fn().mockImplementation(async (path: string) =>
      path === "bookmarks.json" ? { data: file, sha: "b", etag: '"b"' } : { data: tagsFile, sha: "t", etag: '"t"' }),
    readIfChanged: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockImplementation(async (_p: string, mutate: (f: BookmarksFile) => BookmarksFile) => {
      written = mutate(file);
      return { data: written, sha: "b2", etag: '"b2"' };
    }),
  } as unknown as GitHubClient;
  render(<MemoryRouter><TrashPage client={client} /></MemoryRouter>);
  return { client, written: () => written };
}

const LIVE = "01HXYZ8K7M9P3RQ2V5W6Z8B0E1";
const GONE1 = "01HXYZ8K7M9P3RQ2V5W6Z8B0E2";
const GONE2 = "01HXYZ8K7M9P3RQ2V5W6Z8B0E3";

describe("TrashPage empty trash", () => {
  it("confirms, then permanently removes all trashed entries in one write", async () => {
    const user = userEvent.setup();
    const { client, written } = setup([bm(LIVE, null), bm(GONE1, T), bm(GONE2, new Date().toISOString())]);
    await user.click(await screen.findByRole("button", { name: /empty trash \(2\)/i }));
    expect(client.update).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /remove permanently/i }));
    await waitFor(() => expect(client.update).toHaveBeenCalledTimes(1));
    expect(written()!.bookmarks.map((b) => b.id)).toEqual([LIVE]);
    await waitFor(() => expect(screen.queryByTestId("empty-trash")).not.toBeInTheDocument());
  });

  it("is hidden when nothing is in the trash", async () => {
    setup([bm(LIVE, null)]);
    await screen.findByTestId("trash-page");
    await waitFor(() => expect(screen.queryByTestId("empty-trash")).not.toBeInTheDocument());
  });
});
