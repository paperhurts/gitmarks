import {
  GitHubAuthError,
  GitHubNotFoundError,
  type BookmarksFile,
  type GitHubClient,
} from "@gitmarks/core";

export const RECONCILED_AT_KEY = "gitmarks:lastReconciledAt";
export const LAST_ETAG_KEY = "gitmarks:bookmarksEtag";
export const LAST_ERROR_KEY = "gitmarks:lastError";
const BOOKMARKS_PATH = "bookmarks.json";

declare const etagBrand: unique symbol;
export type Etag = string & { readonly [etagBrand]: true };

// Narrow a raw stored string into an Etag, rejecting the empty-string case
// (a representable-but-invalid value that would otherwise take the wrong
// branch in `etag ? readIfChanged : read`).
export function toEtag(s: string): Etag | null {
  return s.length > 0 ? (s as Etag) : null;
}

// Shape persisted under LAST_ERROR_KEY. Read by the popup to surface
// background-poll / reconcile failures to the user.
export interface LastErrorRecord {
  when: number;
  message: string;
  source: "flush" | "poll" | "reconcile";
  kind?: "auth" | "unknown" | "not_configured";
}

// Discriminated union of every key/value pair we may write to
// chrome.storage.local from the orchestration layer. Replaces the prior
// `Record<string, unknown>` looseness so a typo would land at compile time.
export type StorageWrites =
  | { [RECONCILED_AT_KEY]: number }
  | { [LAST_ETAG_KEY]: string }
  | { [LAST_ERROR_KEY]: LastErrorRecord };

export type StorageKey =
  | typeof RECONCILED_AT_KEY
  | typeof LAST_ETAG_KEY
  | typeof LAST_ERROR_KEY;

export interface StorageOps {
  setStorage: (items: StorageWrites) => Promise<void>;
  removeStorage: (key: StorageKey) => Promise<void>;
}

export interface ReconcileDeps extends StorageOps {
  now: number;
  lastReconciledAt: number;
  reconcileIntervalMs: number;
  runReconcile: () => Promise<void>;
}

export async function runMaybeReconcile(deps: ReconcileDeps): Promise<void> {
  // lastReconciledAt is only bumped on success (see line below the catch).
  // A failed reconcile therefore retries on the next service-worker cold
  // start rather than waiting another full interval — do NOT move this
  // stamp into the failure path or before the try block, or transient
  // GitHub 5xx failures will silently cause an hour-long sync blackout.
  if (deps.now - deps.lastReconciledAt < deps.reconcileIntervalMs) return;
  try {
    await deps.runReconcile();
    await deps.setStorage({ [RECONCILED_AT_KEY]: deps.now });
    await deps.removeStorage(LAST_ERROR_KEY);
  } catch (err) {
    console.error("[gitmarks] reconcile failed", err);
    await deps.setStorage({
      [LAST_ERROR_KEY]: {
        when: deps.now,
        message: err instanceof Error ? err.message : String(err),
        source: "reconcile",
        kind: err instanceof GitHubAuthError ? "auth" : "unknown",
      },
    });
  }
}

export interface PollDeps extends StorageOps {
  etag: Etag | null;
  now: number;
  client: GitHubClient;
  applyRemote: (data: BookmarksFile) => Promise<void>;
}

export async function runPollRemoteOnce(deps: PollDeps): Promise<void> {
  try {
    const result = deps.etag !== null
      ? await deps.client.readIfChanged<BookmarksFile>(BOOKMARKS_PATH, deps.etag)
      : await deps.client.read<BookmarksFile>(BOOKMARKS_PATH);
    if (result == null) return;
    await deps.applyRemote(result.data);
    await deps.setStorage({ [LAST_ETAG_KEY]: result.etag });
    await deps.removeStorage(LAST_ERROR_KEY);
  } catch (err) {
    if (err instanceof GitHubNotFoundError) return;
    console.error("[gitmarks] poll failed", err);
    await deps.setStorage({
      [LAST_ERROR_KEY]: {
        when: deps.now,
        message: err instanceof Error ? err.message : String(err),
        source: "poll",
        kind: err instanceof GitHubAuthError ? "auth" : "unknown",
      },
    });
  }
}
