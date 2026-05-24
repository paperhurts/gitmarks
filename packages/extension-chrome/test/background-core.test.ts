import { describe, it, expect, vi } from "vitest";
import type { BookmarksFile, GitHubClient } from "@gitmarks/core";
import {
  GitHubAuthError,
  GitHubNotFoundError,
  GitHubError,
} from "@gitmarks/core";
import {
  runMaybeReconcile,
  runPollRemoteOnce,
} from "../src/lib/background-core.js";

const RECONCILE_INTERVAL_MS = 60 * 60 * 1000;
const NOW = 1_000_000_000;

function fakeStorage() {
  const set = vi.fn(async (_items: Record<string, unknown>) => {});
  const remove = vi.fn(async (_key: string) => {});
  return { set, remove };
}

describe("runMaybeReconcile", () => {
  it("returns early when within the reconcile interval", async () => {
    const runReconcile = vi.fn();
    const storage = fakeStorage();

    await runMaybeReconcile({
      now: NOW,
      lastReconciledAt: NOW - 1000, // 1s ago, well within 1h
      reconcileIntervalMs: RECONCILE_INTERVAL_MS,
      runReconcile,
      setStorage: storage.set,
      removeStorage: storage.remove,
    });

    expect(runReconcile).not.toHaveBeenCalled();
    expect(storage.set).not.toHaveBeenCalled();
  });

  it("runs reconcile + stamps RECONCILED_AT + clears lastError on success", async () => {
    const runReconcile = vi.fn(async () => {});
    const storage = fakeStorage();

    await runMaybeReconcile({
      now: NOW,
      lastReconciledAt: 0,
      reconcileIntervalMs: RECONCILE_INTERVAL_MS,
      runReconcile,
      setStorage: storage.set,
      removeStorage: storage.remove,
    });

    expect(runReconcile).toHaveBeenCalledTimes(1);
    expect(storage.set).toHaveBeenCalledWith({ "gitmarks:lastReconciledAt": NOW });
    expect(storage.remove).toHaveBeenCalledWith("gitmarks:lastError");
  });

  it("persists lastError with kind='auth' on GitHubAuthError", async () => {
    const runReconcile = vi.fn(async () => {
      throw new GitHubAuthError();
    });
    const storage = fakeStorage();

    await runMaybeReconcile({
      now: NOW,
      lastReconciledAt: 0,
      reconcileIntervalMs: RECONCILE_INTERVAL_MS,
      runReconcile,
      setStorage: storage.set,
      removeStorage: storage.remove,
    });

    expect(storage.set).toHaveBeenCalledWith({
      "gitmarks:lastError": {
        when: NOW,
        message: expect.any(String),
        source: "reconcile",
        kind: "auth",
      },
    });
    // Did NOT stamp RECONCILED_AT (so retry will run next cold start)
    expect(storage.set).not.toHaveBeenCalledWith({ "gitmarks:lastReconciledAt": NOW });
  });

  it("persists lastError with kind='unknown' on generic Error", async () => {
    const runReconcile = vi.fn(async () => {
      throw new GitHubError("Server error", 500);
    });
    const storage = fakeStorage();

    await runMaybeReconcile({
      now: NOW,
      lastReconciledAt: 0,
      reconcileIntervalMs: RECONCILE_INTERVAL_MS,
      runReconcile,
      setStorage: storage.set,
      removeStorage: storage.remove,
    });

    const setCall = storage.set.mock.calls.find(
      (c) => "gitmarks:lastError" in c[0],
    );
    expect(setCall).toBeDefined();
    const err = (setCall![0] as any)["gitmarks:lastError"];
    expect(err.kind).toBe("unknown");
    expect(err.source).toBe("reconcile");
  });
});

describe("runPollRemoteOnce", () => {
  function fakeClient(over: any): GitHubClient {
    return over as GitHubClient;
  }

  it("calls read() (not readIfChanged) when etag is null", async () => {
    const read = vi.fn(async () => ({
      data: { version: 1, updated_at: "x", bookmarks: [] } as BookmarksFile,
      sha: "s",
      etag: '"new-etag"',
    }));
    const readIfChanged = vi.fn();
    const applyRemote = vi.fn(async () => {});
    const storage = fakeStorage();

    await runPollRemoteOnce({
      etag: null,
      now: NOW,
      client: fakeClient({ read, readIfChanged }),
      applyRemote,
      setStorage: storage.set,
      removeStorage: storage.remove,
    });

    expect(read).toHaveBeenCalled();
    expect(readIfChanged).not.toHaveBeenCalled();
  });

  it("calls readIfChanged() when etag is set", async () => {
    const readIfChanged = vi.fn(async () => ({
      data: { version: 1, updated_at: "x", bookmarks: [] } as BookmarksFile,
      sha: "s",
      etag: '"new-etag"',
    }));
    const applyRemote = vi.fn(async () => {});
    const storage = fakeStorage();

    await runPollRemoteOnce({
      etag: '"prev-etag"',
      now: NOW,
      client: fakeClient({ readIfChanged }),
      applyRemote,
      setStorage: storage.set,
      removeStorage: storage.remove,
    });

    expect(readIfChanged).toHaveBeenCalledWith("bookmarks.json", '"prev-etag"');
  });

  it("returns early on 304 (readIfChanged returns null) — no apply, no etag write", async () => {
    const readIfChanged = vi.fn(async () => null);
    const applyRemote = vi.fn();
    const storage = fakeStorage();

    await runPollRemoteOnce({
      etag: '"prev-etag"',
      now: NOW,
      client: fakeClient({ readIfChanged }),
      applyRemote,
      setStorage: storage.set,
      removeStorage: storage.remove,
    });

    expect(applyRemote).not.toHaveBeenCalled();
    expect(storage.set).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("on success: applies, sets etag, clears lastError", async () => {
    const data = { version: 1, updated_at: "x", bookmarks: [] } as BookmarksFile;
    const read = vi.fn(async () => ({ data, sha: "s", etag: '"new-etag"' }));
    const applyRemote = vi.fn(async () => {});
    const storage = fakeStorage();

    await runPollRemoteOnce({
      etag: null,
      now: NOW,
      client: fakeClient({ read }),
      applyRemote,
      setStorage: storage.set,
      removeStorage: storage.remove,
    });

    expect(applyRemote).toHaveBeenCalledWith(data);
    expect(storage.set).toHaveBeenCalledWith({
      "gitmarks:bookmarksEtag": '"new-etag"',
    });
    expect(storage.remove).toHaveBeenCalledWith("gitmarks:lastError");
  });

  it("silently swallows GitHubNotFoundError (no lastError, no etag write)", async () => {
    const read = vi.fn(async () => {
      throw new GitHubNotFoundError("bookmarks.json");
    });
    const applyRemote = vi.fn();
    const storage = fakeStorage();

    await runPollRemoteOnce({
      etag: null,
      now: NOW,
      client: fakeClient({ read }),
      applyRemote,
      setStorage: storage.set,
      removeStorage: storage.remove,
    });

    expect(applyRemote).not.toHaveBeenCalled();
    expect(storage.set).not.toHaveBeenCalled();
  });

  it("persists lastError with kind='auth' on GitHubAuthError", async () => {
    const read = vi.fn(async () => {
      throw new GitHubAuthError();
    });
    const applyRemote = vi.fn();
    const storage = fakeStorage();

    await runPollRemoteOnce({
      etag: null,
      now: NOW,
      client: fakeClient({ read }),
      applyRemote,
      setStorage: storage.set,
      removeStorage: storage.remove,
    });

    expect(storage.set).toHaveBeenCalledWith({
      "gitmarks:lastError": {
        when: NOW,
        message: expect.any(String),
        source: "poll",
        kind: "auth",
      },
    });
  });

  it("persists lastError with kind='unknown' on other errors", async () => {
    const read = vi.fn(async () => {
      throw new Error("network down");
    });
    const applyRemote = vi.fn();
    const storage = fakeStorage();

    await runPollRemoteOnce({
      etag: null,
      now: NOW,
      client: fakeClient({ read }),
      applyRemote,
      setStorage: storage.set,
      removeStorage: storage.remove,
    });

    const setCall = storage.set.mock.calls.find(
      (c) => "gitmarks:lastError" in c[0],
    );
    expect(setCall).toBeDefined();
    const err = (setCall![0] as any)["gitmarks:lastError"];
    expect(err.kind).toBe("unknown");
    expect(err.message).toBe("network down");
    expect(err.source).toBe("poll");
  });
});
