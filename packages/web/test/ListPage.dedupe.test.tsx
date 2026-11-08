import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { Bookmark, BookmarksFile, GitHubClient, TagsFile } from "@gitmarks/core";
import { ListPage } from "../src/routes/ListPage.js";

const T = "2026-05-01T00:00:00Z";
// Short labels in tests, valid ULIDs on the wire (the page Zod-validates).
const IDS: Record<string, string> = {
  a: "01HXYZ8K7M9P3RQ2V5W6Z8B0CA", b: "01HXYZ8K7M9P3RQ2V5W6Z8B0CB",
  keep: "01HXYZ8K7M9P3RQ2V5W6Z8B0CC", d1: "01HXYZ8K7M9P3RQ2V5W6Z8B0CD",
  d2: "01HXYZ8K7M9P3RQ2V5W6Z8B0CE", solo: "01HXYZ8K7M9P3RQ2V5W6Z8B0CF",
};
const bm = (label: string, url: string, title: string, tags: string[] = []): Bookmark => ({
  id: IDS[label]!, url, title, folder: "", tags, added_at: T, updated_at: T,
  added_from: "chrome@AAAAAAAA", deleted_at: null, notes: null,
});

const tagsFile: TagsFile = { version: 1, tags: {} };

function setup(bookmarks: Bookmark[]) {
  const file: BookmarksFile = { version: 1, updated_at: T, bookmarks };
  let written: BookmarksFile | null = null;
  const client = {
    read: vi.fn().mockImplementation(async (path: string) => {
      if (path === "bookmarks.json") return { data: file, sha: "b", etag: '"b"' };
      return { data: tagsFile, sha: "t", etag: '"t"' };
    }),
    readIfChanged: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockImplementation(async (_p: string, mutate: (f: BookmarksFile) => BookmarksFile) => {
      written = mutate(file);
      return { data: written, sha: "b2", etag: '"b2"' };
    }),
  } as unknown as GitHubClient;
  render(
    <MemoryRouter>
      <ListPage client={client} />
    </MemoryRouter>,
  );
  return { client, written: () => written };
}

describe("ListPage duplicate cleanup", () => {
  it("shows no notice when there are no duplicates", async () => {
    setup([bm("a", "https://a.example/", "A"), bm("b", "https://b.example/", "B")]);
    await screen.findByText("A");
    expect(screen.queryByTestId("duplicates-notice")).not.toBeInTheDocument();
  });

  it("asks for confirmation, then trashes the extra copies in one write", async () => {
    const user = userEvent.setup();
    const { client, written } = setup([
      bm("keep", "https://dup.example/p", "Dup", ["x"]),
      bm("d1", "https://dup.example/p/", "Dup", ["y"]),
      bm("d2", "https://dup.example/p", "Dup"),
      bm("solo", "https://solo.example/", "Solo"),
    ]);

    const notice = await screen.findByTestId("duplicates-notice");
    expect(notice).toHaveTextContent("2 duplicate entries across 1 URL");

    await user.click(screen.getByRole("button", { name: /remove duplicates/i }));
    expect(client.update).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /move 2 to trash/i }));

    await waitFor(() => expect(client.update).toHaveBeenCalledTimes(1));
    const active = written()!.bookmarks.filter((b) => b.deleted_at == null);
    expect(active.map((b) => b.id)).toEqual([IDS.keep, IDS.solo]);
    expect(active[0]!.tags).toEqual(["x", "y"]);
    await waitFor(() => expect(screen.queryByTestId("duplicates-notice")).not.toBeInTheDocument());
  });

  it("Cancel backs out without writing", async () => {
    const user = userEvent.setup();
    const { client } = setup([bm("a", "https://a.example/", "A"), bm("b", "https://a.example/", "A")]);
    await screen.findByTestId("duplicates-notice");
    await user.click(screen.getByRole("button", { name: /remove duplicates/i }));
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(client.update).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /remove duplicates/i })).toBeInTheDocument();
  });
});
