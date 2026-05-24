import {
  GitHubAuthError,
  GitHubNotFoundError,
  type BookmarksFile,
  type GitHubClient,
} from "@gitmarks/core";

const RECONCILED_AT_KEY = "gitmarks:lastReconciledAt";
const LAST_ETAG_KEY = "gitmarks:bookmarksEtag";
const LAST_ERROR_KEY = "gitmarks:lastError";
const BOOKMARKS_PATH = "bookmarks.json";

export interface ReconcileDeps {
  now: number;
  lastReconciledAt: number;
  reconcileIntervalMs: number;
  runReconcile: () => Promise<void>;
  setStorage: (items: Record<string, unknown>) => Promise<void>;
  removeStorage: (key: string) => Promise<void>;
}

export async function runMaybeReconcile(deps: ReconcileDeps): Promise<void> {
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

export interface PollDeps {
  etag: string | null;
  now: number;
  client: GitHubClient;
  applyRemote: (data: BookmarksFile) => Promise<void>;
  setStorage: (items: Record<string, unknown>) => Promise<void>;
  removeStorage: (key: string) => Promise<void>;
}

export async function runPollRemoteOnce(deps: PollDeps): Promise<void> {
  try {
    const result = deps.etag
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
