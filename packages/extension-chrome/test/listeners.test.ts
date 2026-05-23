import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { GitHubClient } from "@gitmarks/core";
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
});
