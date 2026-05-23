import { describe, it, expect } from "vitest";
import {
  loadIdMap,
  saveIdMap,
  setMapping,
  removeUlidMapping,
  removeNodeMapping,
  ulidForNode,
  nodeForUlid,
} from "../src/lib/id-mapping.js";

describe("id-mapping", () => {
  it("loads empty map when nothing stored", async () => {
    const m = await loadIdMap();
    expect(m.ulidToNode.size).toBe(0);
    expect(m.nodeToUlid.size).toBe(0);
  });

  it("saves and reloads", async () => {
    const m = await loadIdMap();
    setMapping(m, "01HXYZ8K7M9P3RQ2V5W6Z8B0C1", "chrome-100");
    await saveIdMap(m);
    const reloaded = await loadIdMap();
    expect(ulidForNode(reloaded, "chrome-100")).toBe("01HXYZ8K7M9P3RQ2V5W6Z8B0C1");
    expect(nodeForUlid(reloaded, "01HXYZ8K7M9P3RQ2V5W6Z8B0C1")).toBe("chrome-100");
  });

  it("setMapping replaces both directions atomically", async () => {
    const m = await loadIdMap();
    setMapping(m, "ulid-1", "node-A");
    setMapping(m, "ulid-1", "node-B");
    expect(nodeForUlid(m, "ulid-1")).toBe("node-B");
    expect(ulidForNode(m, "node-A")).toBeUndefined();
  });

  it("setMapping clears any prior ulid bound to the same node", async () => {
    const m = await loadIdMap();
    setMapping(m, "ulid-1", "node-A");
    setMapping(m, "ulid-2", "node-A");
    expect(ulidForNode(m, "node-A")).toBe("ulid-2");
    expect(nodeForUlid(m, "ulid-1")).toBeUndefined();
  });

  it("removeUlidMapping clears both sides", async () => {
    const m = await loadIdMap();
    setMapping(m, "ulid-x", "node-x");
    removeUlidMapping(m, "ulid-x");
    expect(nodeForUlid(m, "ulid-x")).toBeUndefined();
    expect(ulidForNode(m, "node-x")).toBeUndefined();
  });

  it("removeNodeMapping clears both sides", async () => {
    const m = await loadIdMap();
    setMapping(m, "ulid-x", "node-x");
    removeNodeMapping(m, "node-x");
    expect(nodeForUlid(m, "ulid-x")).toBeUndefined();
    expect(ulidForNode(m, "node-x")).toBeUndefined();
  });
});
