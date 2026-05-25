import { useState } from "react";
import type { GitHubClient, TagsFile } from "@gitmarks/core";
import { TagManager } from "../components/TagManager.js";
import { Layout, type LayoutStatus } from "../components/Layout.js";
import { useGitmarksData } from "../hooks/useGitmarksData.js";

interface Props {
  client: GitHubClient;
}

export function TagsPage({ client }: Props) {
  const { tagsFile, loading, error, refresh, writeTags } = useGitmarksData(client);
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

  async function onMutate(mutator: (f: TagsFile) => TagsFile) {
    setWriteError(null);
    try {
      await writeTags(mutator, "web: update tags");
    } catch (err) {
      setWriteError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Layout status={status} onRefresh={onRefresh} refreshing={refreshing}>
      <div data-testid="tags-page">
        {tagsFile != null && <TagManager tagsFile={tagsFile} onMutate={onMutate} />}
      </div>
    </Layout>
  );
}
