import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { BookmarksFile, GitHubClient } from "@gitmarks/core";
import {
  registerListeners,
  flushPending,
  __resetForTest,
} from "../src/lib/listeners.js";
import { loadIdMap } from "../src/lib/id-mapping.js";
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
      getIdMap: async () => loadIdMap(),
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
    const idMap = await loadIdMap();

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
    const idMap = await loadIdMap();

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
      getIdMap: async () => loadIdMap(),
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
    const idMap = await loadIdMap();

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
    const idMap = await loadIdMap();
    // Pre-link the existing bookmark to a chrome node.
    const { setMapping } = await import("../src/lib/id-mapping.js");
    setMapping(idMap, "existing-ulid", "node-existing");

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

  it("onChanged for an unmapped node produces no bookmark changes (no-op mutate)", async () => {
    let captured: BookmarksFile | null = null;
    const initial: BookmarksFile = { version: 1, updated_at: "x", bookmarks: [] };
    const update = vi.fn(async (_p: string, mutate: any) => {
      captured = mutate(initial);
      return { data: captured, sha: "s", etag: "" };
    });
    const client = fakeClient({ update });

    registerListeners({
      getClient: async () => client,
      getIdMap: async () => loadIdMap(),
      getBarOtherIds: async () => ({ bar: BAR, other: OTHER }),
      getMachineId: async () => machineId,
    });

    const changeListener = (chrome.bookmarks.onChanged.addListener as any).mock.calls[0]![0];
    changeListener("never-mapped-node", { title: "Whatever" });

    await flushPending();

    // update is called (the event is in surviving), but the mutate is a pure no-op:
    // no bookmark is added/modified because the node has no ULID mapping.
    expect(captured).not.toBeNull();
    expect(captured!.bookmarks.length).toBe(0);
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
    const idMap = await loadIdMap();
    const { setMapping } = await import("../src/lib/id-mapping.js");
    setMapping(idMap, "doomed-ulid", "node-doomed");

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
    const idMap = await loadIdMap();
    const { setMapping } = await import("../src/lib/id-mapping.js");
    setMapping(idMap, "ulid-x", "node-x");
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
      getIdMap: async () => loadIdMap(),
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
});
