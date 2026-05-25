import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { BookmarksFile, TagsFile } from "@gitmarks/core";
import { useGitmarksData } from "../src/hooks/useGitmarksData.js";
import type { GitHubClient } from "@gitmarks/core";

const bookmarksFile: BookmarksFile = {
  version: 1,
  updated_at: "2026-05-23T00:00:00Z",
  bookmarks: [],
};
const tagsFile: TagsFile = { version: 1, tags: {} };

function fakeClient(over: Partial<GitHubClient> = {}): GitHubClient {
  const base: any = {
    read: vi.fn().mockImplementation(async (path: string) => {
      if (path === "bookmarks.json") return { data: bookmarksFile, sha: "b1", etag: '"b"' };
      if (path === "tags.json") return { data: tagsFile, sha: "t1", etag: '"t"' };
      throw new Error("unexpected path");
    }),
    readIfChanged: vi.fn().mockResolvedValue(null),
    update: vi.fn(),
  };
  return Object.assign(base, over) as GitHubClient;
}

describe("useGitmarksData", () => {
  it("loads both files on mount", async () => {
    const client = fakeClient();
    const { result } = renderHook(() => useGitmarksData(client));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.bookmarksFile).toEqual(bookmarksFile);
    expect(result.current.tagsFile).toEqual(tagsFile);
    expect(result.current.error).toBeNull();
  });

  it("refresh() uses readIfChanged with the stored etag and skips on 304", async () => {
    const client = fakeClient();
    const { result } = renderHook(() => useGitmarksData(client));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.refresh();
    });

    expect((client.readIfChanged as any)).toHaveBeenCalledWith("bookmarks.json", '"b"');
    expect((client.readIfChanged as any)).toHaveBeenCalledWith("tags.json", '"t"');
  });

  it("refresh() applies a fresh result when ETag changes", async () => {
    const updated: BookmarksFile = { ...bookmarksFile, updated_at: "2026-05-24T00:00:00Z" };
    const client = fakeClient({
      readIfChanged: vi.fn().mockImplementation(async (path: string) => {
        if (path === "bookmarks.json") return { data: updated, sha: "b2", etag: '"b2"' };
        return null;
      }),
    } as any);
    const { result } = renderHook(() => useGitmarksData(client));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.bookmarksFile).toEqual(updated);
  });

  it("writeTags() calls client.update on tags.json with the mutator", async () => {
    const update = vi.fn().mockResolvedValue({ data: tagsFile, sha: "t2", etag: '"t2"' });
    const client = fakeClient({ update } as any);
    const { result } = renderHook(() => useGitmarksData(client));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const mutator = (f: TagsFile) => f;
    await act(async () => {
      await result.current.writeTags(mutator, "test commit");
    });

    expect(update).toHaveBeenCalledWith("tags.json", mutator, "test commit");
  });

  it("sets error when initial read throws", async () => {
    const client = fakeClient({
      read: vi.fn().mockRejectedValue(new Error("boom")),
    } as any);
    const { result } = renderHook(() => useGitmarksData(client));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toMatch(/boom/);
    expect(result.current.bookmarksFile).toBeNull();
  });
});
