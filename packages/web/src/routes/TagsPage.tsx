import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { GitHubClient, TagsFile } from "@gitmarks/core";
import { TagManager } from "../components/TagManager.js";
import { Layout, type LayoutStatus } from "../components/Layout.js";
import { useGitmarksData } from "../hooks/useGitmarksData.js";
import { toNetscapeHtml } from "../lib/netscape-export.js";
import { downloadString } from "../lib/download.js";
import { clearSettings } from "../lib/settings.js";

interface Props {
  client: GitHubClient;
}

export function TagsPage({ client }: Props) {
  const { bookmarksFile, tagsFile, loading, error, refresh, writeTags } = useGitmarksData(client);
  const navigate = useNavigate();
  const [refreshing, setRefreshing] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);

  const status: LayoutStatus = loading
    ? { kind: "loading", message: "loading…" }
    : writeError != null
      ? { kind: "err", message: writeError }
      : error != null
        ? { kind: "err", message: error }
        : tagsFile != null
          ? { kind: "ok", message: `${Object.keys(tagsFile.tags).length} tags` }
          : { kind: "loading", message: "loading…" };

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

  async function onMutate(mutator: (f: TagsFile) => TagsFile) {
    setWriteError(null);
    try {
      await writeTags(mutator, "web: update tags");
    } catch (err) {
      setWriteError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Layout status={status} onRefresh={onRefresh} onExport={onExport} onSignOut={onSignOut} refreshing={refreshing}>
      <div data-testid="tags-page">
        {tagsFile != null && <TagManager tagsFile={tagsFile} onMutate={onMutate} />}
      </div>
    </Layout>
  );
}
