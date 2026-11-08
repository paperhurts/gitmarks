import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { GitHubClient } from "@gitmarks/core";
import { Layout, type LayoutStatus } from "../components/Layout.js";
import { TrashList } from "../components/TrashList.js";
import { useGitmarksData } from "../hooks/useGitmarksData.js";
import { bulkRestore, emptyTrash } from "../lib/bulk-mutations.js";
import { toNetscapeHtml } from "../lib/netscape-export.js";
import { downloadString } from "../lib/download.js";
import { clearSettings, isExtensionPage } from "../lib/settings.js";

interface Props {
  client: GitHubClient;
}

export function TrashPage({ client }: Props) {
  const { bookmarksFile, tagsFile, loading, error, refresh, writeBookmarks } = useGitmarksData(client);
  const navigate = useNavigate();
  const [refreshing, setRefreshing] = useState(false);
  const [writing, setWriting] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const trashed = useMemo(
    () => bookmarksFile?.bookmarks.filter((b) => b.deleted_at != null).length ?? 0,
    [bookmarksFile],
  );

  const status: LayoutStatus = loading
    ? { kind: "loading", message: "loading…" }
    : writeError != null
      ? { kind: "err", message: writeError }
      : error != null
        ? { kind: "err", message: error }
        : { kind: "ok", message: "trash" };

  async function onRefresh() {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }

  function onExport() {
    if (bookmarksFile == null) return;
    downloadString(toNetscapeHtml(bookmarksFile), "gitmarks.html", "text/html");
  }

  function onSignOut() {
    clearSettings();
    navigate("/setup");
  }

  async function onRestore(id: string) {
    setWriteError(null);
    setWriting(true);
    try {
      const mutator = bulkRestore([id], new Date().toISOString());
      await writeBookmarks(mutator, `restore bookmark ${id}`);
    } catch (err) {
      setWriteError(err instanceof Error ? err.message : String(err));
    } finally {
      setWriting(false);
    }
  }

  async function onEmptyTrash() {
    setConfirmEmpty(false);
    setWriteError(null);
    setWriting(true);
    try {
      await writeBookmarks(emptyTrash(new Date().toISOString()), `empty trash (${trashed} entries)`);
    } catch (err) {
      setWriteError(err instanceof Error ? err.message : String(err));
    } finally {
      setWriting(false);
    }
  }

  const btnClass =
    "px-3 py-1 rounded bg-fog text-cyan-soft text-sm hover:bg-cyan hover:text-ink disabled:opacity-40";
  const dangerClass =
    "px-3 py-1 rounded border border-magenta text-magenta text-sm hover:bg-magenta hover:text-ink disabled:opacity-40";

  return (
    <Layout status={status} onRefresh={onRefresh} onExport={onExport} onSignOut={isExtensionPage() ? undefined : onSignOut} refreshing={refreshing} busy={writing}>
      <div data-testid="trash-page" className="p-4">
        <h1 className="text-magenta text-2xl mb-4">Trash</h1>
        <p className="text-cyan-soft/60 text-xs mb-4">
          Soft-deleted bookmarks from the last 30 days (restorable). After 30 days
          the extension drops them from bookmarks.json on its next save; Empty
          trash removes them right away. Git history keeps everything.
        </p>
        {trashed > 0 && (
          <div data-testid="empty-trash" className="mb-4 flex flex-wrap items-center gap-3 text-sm">
            {!confirmEmpty ? (
              <button type="button" className={btnClass} disabled={writing} onClick={() => setConfirmEmpty(true)}>
                Empty trash ({trashed.toLocaleString()})
              </button>
            ) : (
              <>
                <span className="text-cyan-soft">
                  Permanently remove {trashed.toLocaleString()} entries from bookmarks.json? Git history
                  keeps them. Devices that haven&apos;t synced since they were deleted keep their local copies.
                </span>
                <button type="button" className={dangerClass} disabled={writing} onClick={() => { void onEmptyTrash(); }}>
                  Remove permanently
                </button>
                <button type="button" className={btnClass} disabled={writing} onClick={() => setConfirmEmpty(false)}>
                  Cancel
                </button>
              </>
            )}
          </div>
        )}
        {bookmarksFile != null && tagsFile != null && (
          <TrashList
            bookmarksFile={bookmarksFile}
            tagsFile={tagsFile}
            nowIso={new Date().toISOString()}
            onRestore={onRestore}
          />
        )}
      </div>
    </Layout>
  );
}
