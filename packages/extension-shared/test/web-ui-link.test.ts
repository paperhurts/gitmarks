import { describe, it, expect, vi } from "vitest";
import { wireWebUiLink, WEB_UI_PATH } from "../src/lib/web-ui-link.js";

describe("wireWebUiLink", () => {
  it("points the link at the bundled web UI and opens it in a tab", () => {
    const a = document.createElement("a");
    a.href = "https://paperhurts.github.io/gitmarks/";
    const deps = {
      getURL: vi.fn((p: string) => `chrome-extension://abc/${p}`),
      openTab: vi.fn(),
      closePopup: vi.fn(),
    };
    wireWebUiLink(a, deps);
    expect(deps.getURL).toHaveBeenCalledWith(WEB_UI_PATH);
    expect(a.href).toBe("chrome-extension://abc/web/index.html");

    const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
    a.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(deps.openTab).toHaveBeenCalledWith("chrome-extension://abc/web/index.html");
    expect(deps.closePopup).toHaveBeenCalledTimes(1);
  });

  it("is a no-op without a link", () => {
    expect(() =>
      wireWebUiLink(null, { getURL: () => "", openTab: vi.fn(), closePopup: vi.fn() }),
    ).not.toThrow();
  });
});
