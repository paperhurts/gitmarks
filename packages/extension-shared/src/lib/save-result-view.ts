import type { SaveResult, SaveAllTabsResult } from "./save-flow.js";

/**
 * Apply the outcome of a popup save to the button + status line.
 *
 * On success: show "✓ saved", relabel the button to "Saved ✓" and mark it
 * `done` (the CSS for `.done` cancels the disabled progress-cursor), then
 * auto-dismiss the popup after `closeDelayMs` so it gets out of the way. On
 * failure: surface the message and re-enable the button to retry.
 *
 * Extracted from popup.ts so these transitions are unit-testable without the
 * popup entry's top-level DOM bootstrap (issue #43). The success branch
 * previously left the button stuck on "saving…" with a progress cursor.
 */
export function applySaveResult(
  saveBtn: HTMLButtonElement,
  status: HTMLElement,
  result: SaveResult,
  options: { closePopup?: () => void; closeDelayMs?: number } = {},
): void {
  const { closePopup = () => window.close(), closeDelayMs = 1200 } = options;
  if (result.ok) {
    status.className = "ok";
    status.textContent = "✓ saved";
    saveBtn.textContent = "Saved ✓";
    saveBtn.classList.add("done");
    // Delay leaves screen-reader users time to hear the status update; a no-op
    // when opened as a plain page (e2e) where window.close() does nothing.
    setTimeout(closePopup, closeDelayMs);
  } else {
    status.className = "err";
    status.textContent = result.message;
    saveBtn.disabled = false;
    saveBtn.textContent = "Try again";
  }
}

/**
 * Apply the outcome of a "save all tabs" batch to its button + status line.
 * Mirrors applySaveResult, but the success line reports counts (saved, and
 * how many were skipped as unsafe or duplicate). Issue #46.
 */
export function applySaveAllResult(
  allBtn: HTMLButtonElement,
  status: HTMLElement,
  result: SaveAllTabsResult,
  options: { closePopup?: () => void; closeDelayMs?: number } = {},
): void {
  const { closePopup = () => window.close(), closeDelayMs = 1200 } = options;
  if (result.ok) {
    status.className = "ok";
    const skipped = result.skippedUnsafe + result.skippedDuplicate;
    const tabWord = result.saved === 1 ? "tab" : "tabs";
    status.textContent =
      skipped > 0
        ? `✓ saved ${result.saved} ${tabWord} (skipped ${skipped})`
        : `✓ saved ${result.saved} ${tabWord}`;
    allBtn.textContent = "Saved ✓";
    allBtn.classList.add("done");
    setTimeout(closePopup, closeDelayMs);
  } else {
    status.className = "err";
    status.textContent = result.message;
    allBtn.disabled = false;
    allBtn.textContent = "Try again";
  }
}
