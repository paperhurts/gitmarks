import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Bookmark } from "@gitmarks/core";
import { applySaveResult, applySaveAllResult } from "../src/lib/save-result-view.js";

// applySaveResult ignores the bookmark payload; a cast keeps the fixture terse.
const okResult = { ok: true as const, bookmark: {} as Bookmark };

function makeDom(): { saveBtn: HTMLButtonElement; status: HTMLElement } {
  const saveBtn = document.createElement("button");
  saveBtn.disabled = true;
  saveBtn.textContent = "saving…";
  const status = document.createElement("p");
  return { saveBtn, status };
}

describe("applySaveResult", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("on success: shows saved, relabels button, marks it done, and auto-closes", () => {
    const { saveBtn, status } = makeDom();
    const closePopup = vi.fn();

    applySaveResult(saveBtn, status, okResult, { closePopup, closeDelayMs: 1200 });

    expect(status.className).toBe("ok");
    expect(status.textContent).toBe("✓ saved");
    expect(saveBtn.textContent).toBe("Saved ✓");
    // No longer stuck on "saving…"; the `done` class cancels the progress cursor.
    expect(saveBtn.classList.contains("done")).toBe(true);

    // Popup is not dismissed before the delay elapses...
    expect(closePopup).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1200);
    // ...and exactly once after.
    expect(closePopup).toHaveBeenCalledTimes(1);
  });

  it("on failure: surfaces the message, re-enables the button, never closes", () => {
    const { saveBtn, status } = makeDom();
    const closePopup = vi.fn();

    applySaveResult(
      saveBtn,
      status,
      { ok: false, kind: "unknown", message: "boom" },
      { closePopup },
    );

    expect(status.className).toBe("err");
    expect(status.textContent).toBe("boom");
    expect(saveBtn.disabled).toBe(false);
    expect(saveBtn.textContent).toBe("Try again");
    expect(saveBtn.classList.contains("done")).toBe(false);

    vi.advanceTimersByTime(10_000);
    expect(closePopup).not.toHaveBeenCalled();
  });
});

describe("applySaveAllResult", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("reports the saved count and auto-closes", () => {
    const { saveBtn, status } = makeDom();
    const closePopup = vi.fn();

    applySaveAllResult(
      saveBtn,
      status,
      { ok: true, saved: 3, skippedUnsafe: 0, skippedDuplicate: 0, total: 3 },
      { closePopup, closeDelayMs: 1200 },
    );

    expect(status.className).toBe("ok");
    expect(status.textContent).toBe("✓ saved 3 tabs");
    expect(saveBtn.textContent).toBe("Saved ✓");
    expect(saveBtn.classList.contains("done")).toBe(true);

    vi.advanceTimersByTime(1200);
    expect(closePopup).toHaveBeenCalledTimes(1);
  });

  it("appends a skipped count and singularizes 'tab'", () => {
    const { saveBtn, status } = makeDom();
    applySaveAllResult(
      saveBtn,
      status,
      { ok: true, saved: 1, skippedUnsafe: 1, skippedDuplicate: 2, total: 4 },
      { closePopup: vi.fn() },
    );
    expect(status.textContent).toBe("✓ saved 1 tab (skipped 3)");
  });

  it("on failure: surfaces the message and re-enables the button", () => {
    const { saveBtn, status } = makeDom();
    const closePopup = vi.fn();
    applySaveAllResult(
      saveBtn,
      status,
      { ok: false, kind: "auth", message: "bad token" },
      { closePopup },
    );

    expect(status.className).toBe("err");
    expect(status.textContent).toBe("bad token");
    expect(saveBtn.disabled).toBe(false);
    expect(saveBtn.textContent).toBe("Try again");

    vi.advanceTimersByTime(10_000);
    expect(closePopup).not.toHaveBeenCalled();
  });
});
