import { describe, it, expect } from "vitest";
import type { Bookmarks } from "webextension-polyfill";
import { findRootIds } from "../src/lib/bookmark-roots.js";

const node = (id: string, title: string): Bookmarks.BookmarkTreeNode =>
  ({ id, title }) as Bookmarks.BookmarkTreeNode;

describe("findRootIds", () => {
  it("finds Chrome's Bookmarks Bar (1) and Other Bookmarks (2)", () => {
    const children = [
      node("1", "Bookmarks Bar"),
      node("2", "Other Bookmarks"),
      node("3", "Mobile Bookmarks"),
    ];
    expect(findRootIds(children)).toEqual({ bar: "1", other: "2" });
  });

  it("finds Firefox's toolbar and unfiled roots (regression for #64-family Firefox support)", () => {
    const children = [
      node("toolbar_____", "Bookmarks Toolbar"),
      node("menu________", "Bookmarks Menu"),
      node("unfiled_____", "Other Bookmarks"),
      node("mobile______", "Mobile Bookmarks"),
    ];
    expect(findRootIds(children)).toEqual({
      bar: "toolbar_____",
      other: "unfiled_____",
    });
  });

  it("throws with the seen ids when a root is missing", () => {
    expect(() => findRootIds([node("menu________", "Bookmarks Menu")])).toThrow(
      /could not find.*menu________/,
    );
  });
});
