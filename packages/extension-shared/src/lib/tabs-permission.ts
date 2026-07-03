import browser from "webextension-polyfill";

export type TabsPermissionResult =
  | { granted: true }
  | { granted: false; error: string | null };

/**
 * Request the optional "tabs" permission.
 *
 * MUST be invoked synchronously inside a user-input handler (e.g. as the
 * first statement of a click listener, before any `await`): Firefox voids
 * the input gesture across `await`s — even awaiting permissions.contains()
 * — and rejects permissions.request() outside a gesture (issue #68).
 * Chrome is lenient, which is how the bug shipped.
 *
 * There is deliberately no contains() pre-check: requesting an
 * already-granted permission resolves true without showing a prompt in
 * both browsers.
 *
 * Never rejects — a request() rejection is returned as
 * `{ granted: false, error }` so callers can surface it instead of the
 * handler dying silently.
 */
export function requestTabsPermission(): Promise<TabsPermissionResult> {
  let request: Promise<boolean>;
  try {
    request = browser.permissions.request({ permissions: ["tabs"] });
  } catch (err) {
    return Promise.resolve({ granted: false, error: errMessage(err) });
  }
  return request.then(
    (granted): TabsPermissionResult =>
      granted ? { granted: true } : { granted: false, error: null },
    (err): TabsPermissionResult => ({ granted: false, error: errMessage(err) }),
  );
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
