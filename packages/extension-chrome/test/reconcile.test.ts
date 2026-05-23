import { describe, it, expect, vi } from "vitest";
import type {
  BookmarksFile,
  GitHubClient,
  Bookmark,
} from "@gitmarks/core";
import { GitHubNotFoundError } from "@gitmarks/core";
import { reconcile } from "../src/lib/reconcile.js";
import { loadIdMap, nodeForUlid } from "../src/lib/id-mapping.js";

const BAR = "bar-id";
const OTHER = "other-id";
const machineId = "ABCDE12F";
const nowIso = "2026-05-23T00:00:00Z";

function fakeClient(over: any): GitHubClient {
  return over as GitHubClient;
}

function bm(over: Partial<Bookmark>): Bookmark {
  return {
    id: "u1",
    url: "https://example.com/",
    title: "Example",
    folder: "",
    tags: [],
    added_at: nowIso,
    updated_at: nowIso,
    added_from: "chrome@elsewhere",
    deleted_at: null,
    notes: null,
    ...over,
  };
}

describe("reconcile", () => {
  it("creates a new chrome bookmark for a remote-only entry", async () => {
    const remote: BookmarksFile = {
      version: 1,
      updated_at: nowIso,
      bookmarks: [bm({ id: "u1", url: "https://remote.example/" })],
    };
    const update = vi.fn(async (_p: string, mutate: any) => {
      const next = mutate(remote);
      return { data: next, sha: "s", etag: "" };
    });
    const read = vi.fn(async () => ({ data: remote, sha: "s0", etag: "" }));
    const client = fakeClient({ read, update });

    (chrome.bookmarks.getTree as any).mockResolvedValueOnce([
      { id: "root", children: [
        { id: BAR, title: "Bookmarks Bar", children: [] },
        { id: OTHER, title: "Other Bookmarks", children: [] },
      ] },
    ]);

    const idMap = await loadIdMap();
    await reconcile(client, idMap, BAR, OTHER, machineId, nowIso);

    expect(chrome.bookmarks.create).toHaveBeenCalledWith({
      parentId: BAR,
      title: "Example",
      url: "https://remote.example/",
    });
  });

  it("pushes a local-only bookmark to remote", async () => {
    const remote: BookmarksFile = {
      version: 1,
      updated_at: nowIso,
      bookmarks: [],
    };
    let written: BookmarksFile | null = null;
    const read = vi.fn(async () => ({ data: remote, sha: "s0", etag: "" }));
    const update = vi.fn(async (_p: string, mutate: any) => {
      written = mutate(remote);
      return { data: written, sha: "s1", etag: "" };
    });
    const client = fakeClient({ read, update });

    (chrome.bookmarks.getTree as any).mockResolvedValueOnce([
      { id: "root", children: [
        { id: BAR, title: "Bookmarks Bar", children: [
          { id: "node-1", parentId: BAR, title: "Local", url: "https://local.example/" },
        ] },
        { id: OTHER, title: "Other Bookmarks", children: [] },
      ] },
    ]);

    const idMap = await loadIdMap();
    await reconcile(client, idMap, BAR, OTHER, machineId, nowIso);

    expect(written).not.toBeNull();
    expect(written!.bookmarks.length).toBe(1);
    expect(written!.bookmarks[0]!.url).toBe("https://local.example/");
    expect(written!.bookmarks[0]!.added_from).toBe("chrome@ABCDE12F");
    expect(nodeForUlid(idMap, written!.bookmarks[0]!.id)).toBe("node-1");
  });

  it("does nothing when local and remote already agree by URL", async () => {
    const remote: BookmarksFile = {
      version: 1,
      updated_at: nowIso,
      bookmarks: [bm({ id: "u-existing", url: "https://shared.example/" })],
    };
    const read = vi.fn(async () => ({ data: remote, sha: "s0", etag: "" }));
    const update = vi.fn();
    const client = fakeClient({ read, update });

    (chrome.bookmarks.getTree as any).mockResolvedValueOnce([
      { id: "root", children: [
        { id: BAR, title: "Bookmarks Bar", children: [
          { id: "node-existing", parentId: BAR, title: "Shared", url: "https://shared.example/" },
        ] },
        { id: OTHER, title: "Other Bookmarks", children: [] },
      ] },
    ]);

    const idMap = await loadIdMap();
    await reconcile(client, idMap, BAR, OTHER, machineId, nowIso);

    expect(chrome.bookmarks.create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(nodeForUlid(idMap, "u-existing")).toBe("node-existing");
  });

  it("treats a 404 on read as an empty remote and pushes local-only bookmarks", async () => {
    // reconcile() handles the 404 from client.read() itself — it falls back to an
    // empty remote in-memory.  It then calls updateBookmarksOrBootstrap to push
    // local-only bookmarks; since client.update() succeeds immediately, client.write()
    // (the bootstrap path) is never triggered.
    const read = vi.fn(async () => {
      throw new GitHubNotFoundError("bookmarks.json");
    });
    let written: BookmarksFile | null = null;
    const write = vi.fn(async () => ({ sha: "s0", etag: "" }));
    const update = vi.fn(async (_p: string, mutate: any) => {
      written = mutate({ version: 1, updated_at: nowIso, bookmarks: [] });
      return { data: written, sha: "s1", etag: "" };
    });
    const client = fakeClient({ read, write, update });

    (chrome.bookmarks.getTree as any).mockResolvedValueOnce([
      { id: "root", children: [
        { id: BAR, title: "Bookmarks Bar", children: [
          { id: "node-local", parentId: BAR, title: "Local", url: "https://local.example/" },
        ] },
        { id: OTHER, title: "Other Bookmarks", children: [] },
      ] },
    ]);

    const idMap = await loadIdMap();
    await reconcile(client, idMap, BAR, OTHER, machineId, nowIso);

    // update() is called to push the local-only bookmark to the (empty) remote.
    expect(update).toHaveBeenCalled();
    expect(written).not.toBeNull();
    expect(written!.bookmarks.length).toBe(1);
    expect(written!.bookmarks[0]!.url).toBe("https://local.example/");
    // write() is NOT called because update() succeeds on the first try
    // (the 404 was already handled by reconcile's own read-catch, not by update).
    expect(write).not.toHaveBeenCalled();
  });
});
