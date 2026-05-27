/**
 * Declares the `browser` global used by test stubs, typed via webextension-polyfill.
 * test/setup.ts installs this via vi.stubGlobal("browser", chromeStub).
 *
 * IMPORTANT: this type is narrowed to the runtime API shape that chromeStub
 * actually implements (the lowercase `Static`-typed runtime constants).
 * Using `typeof Browser` would also expose the polyfill's capitalized
 * sub-namespace re-exports (e.g. `browser.Bookmarks`) — those are types only;
 * accessing them at runtime via the test stub crashes with "Cannot read
 * properties of undefined".
 */
import type Browser from "webextension-polyfill";

interface TestBrowserApi {
  bookmarks: Browser.Bookmarks.Static;
  storage: Browser.Storage.Static;
  runtime: Browser.Runtime.Static;
  alarms: Browser.Alarms.Static;
  tabs: Browser.Tabs.Static;
}

declare global {
  // eslint-disable-next-line no-var
  var browser: TestBrowserApi;
}
