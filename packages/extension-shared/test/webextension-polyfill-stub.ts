/**
 * Test-environment stub for webextension-polyfill.
 *
 * The real polyfill throws "This script should only be loaded in a browser
 * extension" when imported in Node/jsdom. We redirect the import here via
 * the vitest alias so source files that do
 *
 *   import browser from "webextension-polyfill";
 *
 * receive the same chromeStub object that test/setup.ts installs as
 * globalThis.browser (and globalThis.chrome).  The Proxy defers the lookup
 * until actual property access, so it works even though setup.ts runs its
 * vi.stubGlobal calls slightly after module evaluation order.
 */
const browserProxy = new Proxy({} as Record<string | symbol, unknown>, {
  get(_target, prop) {
    const g = (globalThis as Record<string, unknown>)["browser"];
    if (g != null) {
      return (g as Record<string | symbol, unknown>)[prop];
    }
    return undefined;
  },
});

export default browserProxy;
