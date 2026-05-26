/**
 * Declares the `browser` global used by test stubs, typed via webextension-polyfill.
 * test/setup.ts installs this via vi.stubGlobal("browser", chromeStub).
 */
import type Browser from "webextension-polyfill";

declare global {
  // eslint-disable-next-line no-var
  var browser: typeof Browser;
}
