import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSelection } from "../src/hooks/useSelection.js";

describe("useSelection", () => {
  it("starts empty", () => {
    const { result } = renderHook(() => useSelection());
    expect(result.current.selected.size).toBe(0);
  });

  it("toggle adds then removes", () => {
    const { result } = renderHook(() => useSelection());
    act(() => result.current.toggle("a"));
    expect(result.current.selected.has("a")).toBe(true);
    act(() => result.current.toggle("a"));
    expect(result.current.selected.has("a")).toBe(false);
  });

  it("setAll replaces selection", () => {
    const { result } = renderHook(() => useSelection());
    act(() => result.current.setAll(["a", "b", "c"]));
    expect(result.current.selected.size).toBe(3);
    act(() => result.current.setAll(["d"]));
    expect([...result.current.selected]).toEqual(["d"]);
  });

  it("clear empties the selection", () => {
    const { result } = renderHook(() => useSelection());
    act(() => result.current.setAll(["a", "b"]));
    act(() => result.current.clear());
    expect(result.current.selected.size).toBe(0);
  });

  it("isSelected reflects state", () => {
    const { result } = renderHook(() => useSelection());
    act(() => result.current.toggle("x"));
    expect(result.current.isSelected("x")).toBe(true);
    expect(result.current.isSelected("y")).toBe(false);
  });
});
