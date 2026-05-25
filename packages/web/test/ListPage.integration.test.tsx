import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { BookmarksFile, GitHubClient, TagsFile } from "@gitmarks/core";
import { ListPage } from "../src/routes/ListPage.js";

const bookmarksFile: BookmarksFile = {
  version: 1,
  updated_at: "2026-05-23T00:00:00Z",
  bookmarks: [
    { id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CA", url: "https://news.ycombinator.com/", title: "Hacker News", folder: "", tags: ["daily"], added_at: "2026-05-01T00:00:00Z", updated_at: "2026-05-01T00:00:00Z", added_from: "chrome@minerva", deleted_at: null, notes: null },
    { id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CB", url: "https://lobste.rs/", title: "Lobsters", folder: "", tags: ["daily"], added_at: "2026-05-01T00:00:00Z", updated_at: "2026-05-01T00:00:00Z", added_from: "chrome@minerva", deleted_at: null, notes: null },
    { id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CC", url: "https://tailwindcss.com/docs", title: "Tailwind", folder: "", tags: ["reference"], added_at: "2026-05-01T00:00:00Z", updated_at: "2026-05-01T00:00:00Z", added_from: "chrome@minerva", deleted_at: null, notes: null },
  ],
};

const tagsFile: TagsFile = {
  version: 1,
  tags: {
    daily: { color: "#00FFFF", description: null },
    reference: { color: "#00FF88", description: null },
  },
};

function fakeClient(): GitHubClient {
  return {
    read: vi.fn().mockImplementation(async (path: string) => {
      if (path === "bookmarks.json") return { data: bookmarksFile, sha: "b", etag: '"b"' };
      if (path === "tags.json") return { data: tagsFile, sha: "t", etag: '"t"' };
      throw new Error("unexpected");
    }),
    readIfChanged: vi.fn().mockResolvedValue(null),
    update: vi.fn(),
  } as any;
}

describe("ListPage integration", () => {
  it("filters the list when the user types in the search box", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ListPage client={fakeClient()} />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Hacker News")).toBeInTheDocument();
    await user.type(screen.getByLabelText(/search/i), "tailwind");
    expect(screen.getByText("Tailwind")).toBeInTheDocument();
    expect(screen.queryByText("Hacker News")).not.toBeInTheDocument();
  });

  it("filters the list when a tag chip is clicked in the sidebar", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ListPage client={fakeClient()} />
      </MemoryRouter>,
    );
    await screen.findByText("Hacker News");
    await user.click(screen.getByRole("button", { name: /^daily$/i }));
    expect(screen.getByText("Hacker News")).toBeInTheDocument();
    expect(screen.getByText("Lobsters")).toBeInTheDocument();
    expect(screen.queryByText("Tailwind")).not.toBeInTheDocument();
  });

  it("clears the tag filter when the same chip is clicked again", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ListPage client={fakeClient()} />
      </MemoryRouter>,
    );
    await screen.findByText("Hacker News");
    const chip = screen.getByRole("button", { name: /^daily$/i });
    await user.click(chip);
    await user.click(chip);
    expect(screen.getByText("Tailwind")).toBeInTheDocument();
  });

  it("shows the bulk actions bar after selecting a row", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ListPage client={fakeClient()} />
      </MemoryRouter>,
    );
    await screen.findByText("Hacker News");
    await user.click(screen.getByLabelText(/select hacker news/i));
    expect(screen.getByText(/1 selected/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /move to trash/i })).toBeInTheDocument();
  });

  it("calls client.update on bookmarks.json when Move to trash is clicked", async () => {
    const update = vi.fn().mockResolvedValue({ data: bookmarksFile, sha: "b2", etag: '"b2"' });
    const client = {
      read: vi.fn().mockImplementation(async (path: string) => {
        if (path === "bookmarks.json") return { data: bookmarksFile, sha: "b", etag: '"b"' };
        if (path === "tags.json") return { data: tagsFile, sha: "t", etag: '"t"' };
        throw new Error("unexpected");
      }),
      readIfChanged: vi.fn().mockResolvedValue(null),
      update,
    } as any;
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ListPage client={client} />
      </MemoryRouter>,
    );
    await screen.findByText("Hacker News");
    await user.click(screen.getByLabelText(/select hacker news/i));
    await user.click(screen.getByRole("button", { name: /move to trash/i }));
    expect(update).toHaveBeenCalledWith("bookmarks.json", expect.any(Function), expect.stringContaining("trash"));
  });
});
