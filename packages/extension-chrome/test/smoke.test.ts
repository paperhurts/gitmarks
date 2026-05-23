import { describe, it, expect } from "vitest";

describe("@gitmarks/extension-chrome smoke", () => {
  it("has chrome.storage stubbed by the global setup", () => {
    expect(typeof chrome).toBe("object");
    expect(typeof chrome.storage.local.get).toBe("function");
  });
});
