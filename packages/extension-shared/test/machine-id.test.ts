import { describe, it, expect } from "vitest";
import { getMachineId } from "../src/lib/machine-id.js";

describe("machine-id", () => {
  it("generates an 8-char Crockford base32 id on first call", async () => {
    const id = await getMachineId();
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
  });

  it("returns the same id on subsequent calls", async () => {
    const a = await getMachineId();
    const b = await getMachineId();
    expect(a).toBe(b);
  });

  it("persists the id in browser.storage.local under 'gitmarks:machineId'", async () => {
    const id = await getMachineId();
    const stored = await browser.storage.local.get("gitmarks:machineId");
    expect(stored["gitmarks:machineId"]).toBe(id);
  });
});
