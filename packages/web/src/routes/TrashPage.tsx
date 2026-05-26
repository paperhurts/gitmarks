import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { GitHubClient } from "@gitmarks/core";
import { Layout, type LayoutStatus } from "../components/Layout.js";
import { TrashList } from "../components/TrashList.js";
import { useGitmarksData } from "../hooks/useGitmarksData.js";
import { bulkRestore } from "../lib/bulk-mutations.js";
import { toNetscapeHtml } from "../lib/netscape-export.js";
import { downloadString } from "../lib/download.js";
import { clearSettings } from "../lib/settings.js";

interface Props {
  client: GitHubClient;
}

export function TrashPage({ client }: Props) {
  const { bookmarksFile, tagsFile, loading, error, refresh, writeBookmarks } = useGitmarksData(client);
  const navigate = useNavigate();
  const [refreshing, setRefreshing] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);

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
    try {
      const mutator = bulkRestore([id], new Date().toISOString());
      await writeBookmarks(mutator, `restore bookmark ${id}`);
    } catch (err) {
      setWriteError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Layout status={status} onRefresh={onRefresh} onExport={onExport} onSignOut={onSignOut} refreshing={refreshing}>
      <div data-testid="trash-page" className="p-4">
        <h1 className="text-magenta text-2xl mb-4">Trash</h1>
        <p className="text-cyan-soft/60 text-xs mb-4">
          Soft-deleted bookmarks within the 30-day GC window. After 30 days the
          extension's gcTombstones removes them from bookmarks.json; git history
          retains everything.
        </p>
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
