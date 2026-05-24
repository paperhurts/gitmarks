import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { BookmarksFile, GitHubClient } from "@gitmarks/core";
import {
  registerListeners,
  flushPending,
  __resetForTest,
} from "../src/lib/listeners.js";
import { IdMap, asUlid, asNodeId } from "../src/lib/id-mapping.js";
import { suppress } from "../src/lib/suppression.js";

const BAR = "bar-id";
const OTHER = "other-id";
const machineId = "ABCDE12F";

function fakeClient(over: any): GitHubClient {
  return over as GitHubClient;
}

describe("listeners", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __resetForTest();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("registerListeners hooks all 4 events", () => {
    registerListeners({
      getClient: async () => fakeClient({}),
      getIdMap: async () => IdMap.load(),
      getBarOtherIds: async () => ({ bar: BAR, other: OTHER }),
      getMachineId: async () => machineId,
    });
    expect(chrome.bookmarks.onCreated.addListener).toHaveBeenCalledTimes(1);
    expect(chrome.bookmarks.onChanged.addListener).toHaveBeenCalledTimes(1);
    expect(chrome.bookmarks.onMoved.addListener).toHaveBeenCalledTimes(1);
    expect(chrome.bookmarks.onRemoved.addListener).toHaveBeenCalledTimes(1);
  });

  it("flush pushes a pending create through GitHubClient.update", async () => {
    const update = vi.fn(async (_p: string, mutate: any) => {
      const next = mutate({ version: 1, updated_at: "x", bookmarks: [] });
      return { data: next, sha: "s", etag: "" };
    });
    const client = fakeClient({ update });
    const idMap = await IdMap.load();

    registerListeners({
      getClient: async () => client,
      getIdMap: async () => idMap,
      getBarOtherIds: async () => ({ bar: BAR, other: OTHER }),
      getMachineId: async () => machineId,
    });

    const createListener = (chrome.bookmarks.onCreated.addListener as any).mock.calls[0]![0];
    createListener("node-new", {
      id: "node-new",
      parentId: BAR,
      title: "New",
      url: "https://new.example/",
    });

    await flushPending();

    expect(update).toHaveBeenCalledTimes(1);
    const callArgs = update.mock.calls[0]!;
    const mutate = callArgs[1] as (f: any) => any;
    const result = mutate({ version: 1, updated_at: "x", bookmarks: [] });
    expect(result.bookmarks.length).toBe(1);
    expect(result.bookmarks[0]!.url).toBe("https://new.example/");
  });

  it("flush skips events for suppressed URLs", async () => {
    const update = vi.fn(async (_p: string, mutate: any) => ({ data: mutate({ version: 1, updated_at: "x", bookmarks: [] }), sha: "s", etag: "" }));
    const client = fakeClient({ update });
    const idMap = await IdMap.load();

    registerListeners({
      getClient: async () => client,
      getIdMap: async () => idMap,
      getBarOtherIds: async () => ({ bar: BAR, other: OTHER }),
      getMachineId: async () => machineId,
    });

    suppress("https://suppressed.example/");

    const createListener = (chrome.bookmarks.onCreated.addListener as any).mock.calls[0]![0];
    createListener("node-x", {
      id: "node-x",
      parentId: BAR,
      title: "Sup",
      url: "https://suppressed.example/",
    });

    await flushPending();

    expect(update).not.toHaveBeenCalled();
  });

  it("debounces: multiple rapid events → single flush", async () => {
    const update = vi.fn(async (_p: string, mutate: any) => ({ data: mutate({ version: 1, updated_at: "x", bookmarks: [] }), sha: "s", etag: "" }));
    const client = fakeClient({ update });

    registerListeners({
      getClient: async () => client,
      getIdMap: async () => IdMap.load(),
      getBarOtherIds: async () => ({ bar: BAR, other: OTHER }),
      getMachineId: async () => machineId,
    });

    const createListener = (chrome.bookmarks.onCreated.addListener as any).mock.calls[0]![0];
    for (let i = 0; i < 5; i++) {
      createListener(`node-${i}`, {
        id: `node-${i}`,
        parentId: BAR,
        title: `T${i}`,
        url: `https://example.com/${i}`,
      });
    }

    expect(update).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(600);

    expect(update).toHaveBeenCalledTimes(1);
  });

  // I4: applyBatch purity under simulated 409 retry
  it("applyBatch is idempotent when client.update calls mutate twice (409 retry)", async () => {
    // Simulate update() calling mutate twice (once on initial, once on retry after 409).
    // The mutate fn must produce identical results both times so the final write
    // doesn't double-add bookmarks.
    const capturedResults: BookmarksFile[] = [];
    const update = vi.fn(async (_p: string, mutate: any) => {
      const initial: BookmarksFile = { version: 1, updated_at: "x", bookmarks: [] };
      const first = mutate(initial);
      capturedResults.push(first);
      const second = mutate(initial); // simulate 409 retry against fresh data
      capturedResults.push(second);
      return { data: second, sha: "s", etag: "" };
    });
    const client = fakeClient({ update });
    const idMap = await IdMap.load();

    registerListeners({
      getClient: async () => client,
      getIdMap: async () => idMap,
      getBarOtherIds: async () => ({ bar: BAR, other: OTHER }),
      getMachineId: async () => machineId,
    });

    const createListener = (chrome.bookmarks.onCreated.addListener as any).mock.calls[0]![0];
    createListener("node-new", {
      id: "node-new",
      parentId: BAR,
      title: "Doc",
      url: "https://example.com/doc",
    });

    await flushPending();

    expect(capturedResults.length).toBe(2);
    // Both invocations must produce structurally identical files.
    expect(capturedResults[0]!.bookmarks.length).toBe(1);
    expect(capturedResults[1]!.bookmarks.length).toBe(1);
    expect(capturedResults[0]!.bookmarks[0]!.id).toBe(capturedResults[1]!.bookmarks[0]!.id);
    expect(capturedResults[0]!.bookmarks[0]!.url).toBe(capturedResults[1]!.bookmarks[0]!.url);
  });

  // I5: onChanged dispatch
  it("onChanged dispatches a title-only update through GitHubClient.update", async () => {
    let captured: BookmarksFile | null = null;
    const update = vi.fn(async (_p: string, mutate: any) => {
      const initial: BookmarksFile = {
        version: 1,
        updated_at: "x",
        bookmarks: [
          {
            id: "existing-ulid",
            url: "https://example.com/",
            title: "Old",
            folder: "",
            tags: [],
            added_at: "y",
            updated_at: "y",
            added_from: "chrome@other",
            deleted_at: null,
            notes: null,
          },
        ],
      };
      captured = mutate(initial);
      return { data: captured, sha: "s", etag: "" };
    });
    const client = fakeClient({ update });
    const idMap = await IdMap.load();
    // Pre-link the existing bookmark to a chrome node.
    idMap.set(asUlid("existing-ulid"), asNodeId("node-existing"));

    registerListeners({
      getClient: async () => client,
      getIdMap: async () => idMap,
      getBarOtherIds: async () => ({ bar: BAR, other: OTHER }),
      getMachineId: async () => machineId,
    });

    const changeListener = (chrome.bookmarks.onChanged.addListener as any).mock.calls[0]![0];
    changeListener("node-existing", { title: "New title" });

    await flushPending();

    expect(captured).not.toBeNull();
    expect(captured!.bookmarks[0]!.title).toBe("New title");
  });

  it("create + update on the same nodeId within one batch lands with the updated title (issue #19)", async () => {
    // User creates a bookmark and then immediately renames it within the
    // 500ms debounce window. Both events land in the same flush batch.
    // Pre-fix: the update event saw idMap.ulidForNode == null (the create's
    // mapping isn't applied until after the write succeeds) and the surviving
    // filter dropped the update entirely. Result: the file written to GitHub
    // had the ORIGINAL title.
    // Fix: surviving filter accepts updates whose nodeId has a create in the
    // same batch; applyBatch's update branch consults createUlids when idMap
    // returns null.
    let captured: BookmarksFile | null = null;
    const update = vi.fn(async (_p: string, mutate: any) => {
      captured = mutate({ version: 1, updated_at: "x", bookmarks: [] });
      return { data: captured, sha: "s", etag: "" };
    });
    const client = fakeClient({ update });

    registerListeners({
      getClient: async () => client,
      getIdMap: async () => IdMap.load(),
      getBarOtherIds: async () => ({ bar: BAR, other: OTHER }),
      getMachineId: async () => machineId,
    });

    const createListener = (chrome.bookmarks.onCreated.addListener as any).mock.calls[0]![0];
    const changeListener = (chrome.bookmarks.onChanged.addListener as any).mock.calls[0]![0];

    createListener("node-1", {
      id: "node-1",
      parentId: BAR,
      title: "Original",
      url: "https://example.com/",
    });
    changeListener("node-1", { title: "Renamed" });

    await flushPending();

    expect(captured).not.toBeNull();
    expect(captured!.bookmarks.length).toBe(1);
    expect(captured!.bookmarks[0]!.title).toBe("Renamed");
  });

  it("onChanged with no URL is suppressed when nodeId is in the node-suppression registry (title-only echo from apply-remote)", async () => {
    // Issue #18 finding A: apply-remote's chrome.bookmarks.update({title})
    // fires onChanged with changeInfo.url === undefined. URL-suppression
    // doesn't catch the echo. NodeId-suppression does.
    const update = vi.fn();
    const client = fakeClient({ update });
    const idMap = await IdMap.load();
    idMap.set(asUlid("u1"), asNodeId("node-1"));

    registerListeners({
      getClient: async () => client,
      getIdMap: async () => idMap,
      getBarOtherIds: async () => ({ bar: BAR, other: OTHER }),
      getMachineId: async () => machineId,
    });

    const { suppressNode } = await import("../src/lib/suppression.js");
    suppressNode("node-1");

    const changeListener = (chrome.bookmarks.onChanged.addListener as any).mock.calls[0]![0];
    changeListener("node-1", { title: "new" });

    await flushPending();

    expect(update).not.toHaveBeenCalled();
  });

  it("onRemoved for an unmapped node skips the GitHub round-trip entirely (issue #18 symmetric to #8)", async () => {
    const update = vi.fn();
    const client = fakeClient({ update });

    registerListeners({
      getClient: async () => client,
      getIdMap: async () => IdMap.load(),
      getBarOtherIds: async () => ({ bar: BAR, other: OTHER }),
      getMachineId: async () => machineId,
    });

    const removeListener = (chrome.bookmarks.onRemoved.addListener as any).mock.calls[0]![0];
    removeListener("never-mapped-node", {
      parentId: BAR,
      index: 0,
      node: {
        id: "never-mapped-node",
        parentId: BAR,
        title: "Stranger",
        url: "https://stranger.example/",
      },
    });

    await flushPending();

    expect(update).not.toHaveBeenCalled();
  });

  it("onChanged for an unmapped node skips the GitHub round-trip entirely", async () => {
    // Issue #8: when onChanged fires for a node with no ULID mapping, the
    // previous behavior called client.update() with a no-op mutate — a wasted
    // network round-trip. The fix: filter unmapped update/remove events out
    // of the surviving batch before invoking the client.
    const update = vi.fn();
    const client = fakeClient({ update });

    registerListeners({
      getClient: async () => client,
      getIdMap: async () => IdMap.load(),
      getBarOtherIds: async () => ({ bar: BAR, other: OTHER }),
      getMachineId: async () => machineId,
    });

    const changeListener = (chrome.bookmarks.onChanged.addListener as any).mock.calls[0]![0];
    changeListener("never-mapped-node", { title: "Whatever" });

    await flushPending();

    expect(update).not.toHaveBeenCalled();
  });

  // I5: onRemoved dispatch
  it("onRemoved for a mapped node soft-deletes the bookmark", async () => {
    let captured: BookmarksFile | null = null;
    const update = vi.fn(async (_p: string, mutate: any) => {
      const initial: BookmarksFile = {
        version: 1,
        updated_at: "x",
        bookmarks: [
          {
            id: "doomed-ulid",
            url: "https://example.com/doomed",
            title: "Doomed",
            folder: "",
            tags: [],
            added_at: "y",
            updated_at: "y",
            added_from: "chrome@other",
            deleted_at: null,
            notes: null,
          },
        ],
      };
      captured = mutate(initial);
      return { data: captured, sha: "s", etag: "" };
    });
    const client = fakeClient({ update });
    const idMap = await IdMap.load();
    idMap.set(asUlid("doomed-ulid"), asNodeId("node-doomed"));

    registerListeners({
      getClient: async () => client,
      getIdMap: async () => idMap,
      getBarOtherIds: async () => ({ bar: BAR, other: OTHER }),
      getMachineId: async () => machineId,
    });

    const removeListener = (chrome.bookmarks.onRemoved.addListener as any).mock.calls[0]![0];
    removeListener("node-doomed", {
      parentId: BAR,
      index: 0,
      node: {
        id: "node-doomed",
        parentId: BAR,
        title: "Doomed",
        url: "https://example.com/doomed",
      },
    });

    await flushPending();

    expect(captured).not.toBeNull();
    expect(captured!.bookmarks[0]!.deleted_at).not.toBeNull();
  });

  it("onRemoved for a suppressed URL is filtered out (no update)", async () => {
    const update = vi.fn();
    const client = fakeClient({ update });
    const idMap = await IdMap.load();
    idMap.set(asUlid("ulid-x"), asNodeId("node-x"));
    const { suppress: doSuppress } = await import("../src/lib/suppression.js");
    doSuppress("https://suppressed.example/");

    registerListeners({
      getClient: async () => client,
      getIdMap: async () => idMap,
      getBarOtherIds: async () => ({ bar: BAR, other: OTHER }),
      getMachineId: async () => machineId,
    });

    const removeListener = (chrome.bookmarks.onRemoved.addListener as any).mock.calls[0]![0];
    removeListener("node-x", {
      parentId: BAR,
      index: 0,
      node: {
        id: "node-x",
        parentId: BAR,
        title: "Sup",
        url: "https://suppressed.example/",
      },
    });

    await flushPending();

    expect(update).not.toHaveBeenCalled();
  });

  it("onRemoved for a folder (no URL) is ignored", async () => {
    const update = vi.fn();
    const client = fakeClient({ update });

    registerListeners({
      getClient: async () => client,
      getIdMap: async () => IdMap.load(),
      getBarOtherIds: async () => ({ bar: BAR, other: OTHER }),
      getMachineId: async () => machineId,
    });

    const removeListener = (chrome.bookmarks.onRemoved.addListener as any).mock.calls[0]![0];
    removeListener("folder-node", {
      parentId: BAR,
      index: 0,
      node: { id: "folder-node", parentId: BAR, title: "A Folder" }, // no url
    });

    await flushPending();

    expect(update).not.toHaveBeenCalled();
  });

  it("applies exponential backoff after a flush failure", async () => {
    const update = vi.fn();
    // Make the first flush fail
    update.mockRejectedValueOnce(new Error("boom"));
    // Second flush succeeds
    update.mockResolvedValueOnce({ data: { version: 1, updated_at: "x", bookmarks: [] }, sha: "s", etag: "" });
    const client = fakeClient({ update });

    registerListeners({
      getClient: async () => client,
      getIdMap: async () => IdMap.load(),
      getBarOtherIds: async () => ({ bar: BAR, other: OTHER }),
      getMachineId: async () => machineId,
    });

    const createListener = (chrome.bookmarks.onCreated.addListener as any).mock.calls[0]![0];
    createListener("node-1", {
      id: "node-1",
      parentId: BAR,
      title: "T",
      url: "https://example.com/x",
    });

    // First debounce window (500ms) elapses → first flush fails
    await vi.advanceTimersByTimeAsync(600);
    expect(update).toHaveBeenCalledTimes(1);

    // Re-schedule should be 1s (500ms * 2^1 = 1000ms) — advance by less and assert no second call yet
    await vi.advanceTimersByTimeAsync(800);
    expect(update).toHaveBeenCalledTimes(1);

    // Advance past the backoff threshold
    await vi.advanceTimersByTimeAsync(400);
    expect(update).toHaveBeenCalledTimes(2);
  });

  it("clears gitmarks:lastError after a successful flush", async () => {
    // Seed an error
    await chrome.storage.local.set({
      "gitmarks:lastError": { when: 1, message: "old", source: "flush" },
    });

    const update = vi.fn(async (_p: string, mutate: any) => ({
      data: mutate({ version: 1, updated_at: "x", bookmarks: [] }),
      sha: "s",
      etag: "",
    }));
    const client = fakeClient({ update });

    registerListeners({
      getClient: async () => client,
      getIdMap: async () => IdMap.load(),
      getBarOtherIds: async () => ({ bar: BAR, other: OTHER }),
      getMachineId: async () => machineId,
    });

    const createListener = (chrome.bookmarks.onCreated.addListener as any).mock.calls[0]![0];
    createListener("node-1", {
      id: "node-1",
      parentId: BAR,
      title: "T",
      url: "https://example.com/y",
    });

    // Advance past the debounce window to trigger runFlush (which clears the error key on success)
    await vi.advanceTimersByTimeAsync(600);

    const stored = await chrome.storage.local.get("gitmarks:lastError");
    expect(stored["gitmarks:lastError"]).toBeUndefined();
  });
});
