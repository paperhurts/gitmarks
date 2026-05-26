/**
 * Declares the `chrome` global used by test stubs, typed via webextension-polyfill.
 * Replaces the ambient `chrome` global that was previously supplied by @types/chrome.
 */
import type Browser from "webextension-polyfill";

declare global {
  // eslint-disable-next-line no-var
  var chrome: typeof Browser;
}
