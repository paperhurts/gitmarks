import { describe, it, expect } from "vitest";
import { IdMap, asUlid, asNodeId } from "../src/lib/id-mapping.js";

describe("IdMap", () => {
  it("starts empty", () => {
    const m = IdMap.empty();
    expect(m.size).toBe(0);
  });

  it("load() returns empty when nothing stored", async () => {
    const m = await IdMap.load();
    expect(m.size).toBe(0);
  });

  it("set + save + load round-trips", async () => {
    const m = IdMap.empty();
    m.set(asUlid("01HXYZ8K7M9P3RQ2V5W6Z8B0C1"), asNodeId("chrome-100"));
    await m.save();
    const reloaded = await IdMap.load();
    expect(reloaded.ulidForNode(asNodeId("chrome-100"))).toBe("01HXYZ8K7M9P3RQ2V5W6Z8B0C1");
    expect(reloaded.nodeForUlid(asUlid("01HXYZ8K7M9P3RQ2V5W6Z8B0C1"))).toBe("chrome-100");
  });

  it("set replaces a prior nodeId bound to the same ulid", () => {
    const m = IdMap.empty();
    m.set(asUlid("ulid-1"), asNodeId("node-A"));
    m.set(asUlid("ulid-1"), asNodeId("node-B"));
    expect(m.nodeForUlid(asUlid("ulid-1"))).toBe("node-B");
    expect(m.ulidForNode(asNodeId("node-A"))).toBeUndefined();
  });

  it("set replaces a prior ulid bound to the same nodeId", () => {
    const m = IdMap.empty();
    m.set(asUlid("ulid-1"), asNodeId("node-A"));
    m.set(asUlid("ulid-2"), asNodeId("node-A"));
    expect(m.ulidForNode(asNodeId("node-A"))).toBe("ulid-2");
    expect(m.nodeForUlid(asUlid("ulid-1"))).toBeUndefined();
  });

  it("removeByUlid clears both sides", () => {
    const m = IdMap.empty();
    m.set(asUlid("ulid-x"), asNodeId("node-x"));
    m.removeByUlid(asUlid("ulid-x"));
    expect(m.nodeForUlid(asUlid("ulid-x"))).toBeUndefined();
    expect(m.ulidForNode(asNodeId("node-x"))).toBeUndefined();
    expect(m.size).toBe(0);
  });

  it("removeByNode clears both sides", () => {
    const m = IdMap.empty();
    m.set(asUlid("ulid-x"), asNodeId("node-x"));
    m.removeByNode(asNodeId("node-x"));
    expect(m.nodeForUlid(asUlid("ulid-x"))).toBeUndefined();
    expect(m.ulidForNode(asNodeId("node-x"))).toBeUndefined();
    expect(m.size).toBe(0);
  });

  it("removing a never-mapped key is a no-op", () => {
    const m = IdMap.empty();
    m.removeByUlid(asUlid("never"));
    m.removeByNode(asNodeId("also-never"));
    expect(m.size).toBe(0);
  });
});
