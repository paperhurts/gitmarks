import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  suppress,
  isSuppressed,
  suppressNode,
  isNodeSuppressed,
  clearSuppression,
} from "../src/lib/suppression.js";

describe("suppression", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearSuppression();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("isSuppressed returns false for unregistered URLs", () => {
    expect(isSuppressed("https://example.com/")).toBe(false);
  });

  it("suppress then immediate isSuppressed → true", () => {
    suppress("https://example.com/");
    expect(isSuppressed("https://example.com/")).toBe(true);
  });

  it("isSuppressed returns false after the TTL expires", () => {
    suppress("https://example.com/");
    vi.advanceTimersByTime(2001);
    expect(isSuppressed("https://example.com/")).toBe(false);
  });

  it("re-suppressing the same URL resets the TTL", () => {
    suppress("https://example.com/");
    vi.advanceTimersByTime(1900);
    suppress("https://example.com/");
    vi.advanceTimersByTime(1900);
    expect(isSuppressed("https://example.com/")).toBe(true);
  });

  it("clearSuppression empties the registry", () => {
    suppress("https://example.com/");
    suppress("https://other.com/");
    clearSuppression();
    expect(isSuppressed("https://example.com/")).toBe(false);
    expect(isSuppressed("https://other.com/")).toBe(false);
  });

  it("isNodeSuppressed returns false for unregistered nodeIds", () => {
    expect(isNodeSuppressed("node-1")).toBe(false);
  });

  it("suppressNode then immediate isNodeSuppressed → true", () => {
    suppressNode("node-1");
    expect(isNodeSuppressed("node-1")).toBe(true);
  });

  it("isNodeSuppressed returns false after the TTL expires", () => {
    suppressNode("node-1");
    vi.advanceTimersByTime(2001);
    expect(isNodeSuppressed("node-1")).toBe(false);
  });

  it("clearSuppression empties the node registry too", () => {
    suppress("https://example.com/");
    suppressNode("node-1");
    clearSuppression();
    expect(isSuppressed("https://example.com/")).toBe(false);
    expect(isNodeSuppressed("node-1")).toBe(false);
  });

  it("URL and node registries are independent", () => {
    suppress("https://example.com/");
    expect(isNodeSuppressed("https://example.com/")).toBe(false);
    suppressNode("node-1");
    expect(isSuppressed("node-1")).toBe(false);
  });
});
