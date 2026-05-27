import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { BookmarksFile, GitHubClient } from "@gitmarks/core";
import { useGitmarksData } from "../hooks/useGitmarksData.js";
import { useSelection } from "../hooks/useSelection.js";
import { BookmarkList } from "../components/BookmarkList.js";
import { BulkActionsBar } from "../components/BulkActionsBar.js";
import { SearchBar } from "../components/SearchBar.js";
import { TagFilter } from "../components/TagFilter.js";
import { Layout, type LayoutStatus } from "../components/Layout.js";
import { allUsedTags, searchBookmarks, visibleBookmarks } from "../lib/data.js";
import {
  bulkAddTag,
  bulkRemoveTag,
  bulkSetFolder,
  bulkSoftDelete,
} from "../lib/bulk-mutations.js";
import { toNetscapeHtml } from "../lib/netscape-export.js";
import { downloadString } from "../lib/download.js";
import { clearSettings } from "../lib/settings.js";

interface Props {
  client: GitHubClient;
}

export function ListPage({ client }: Props) {
  const { bookmarksFile, tagsFile, loading, error, refresh, writeBookmarks } = useGitmarksData(client);
  const selection = useSelection();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [writing, setWriting] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);

  const visible = useMemo(
    () => (bookmarksFile != null ? visibleBookmarks(bookmarksFile) : []),
    [bookmarksFile],
  );
  const tagFiltered = useMemo(
    () => (selectedTag == null ? visible : visible.filter((b) => b.tags.includes(selectedTag))),
    [visible, selectedTag],
  );
  const searched = useMemo(
    () => searchBookmarks(tagFiltered, query),
    [tagFiltered, query],
  );
  const used = useMemo(() => allUsedTags(visible), [visible]);

  const status: LayoutStatus = loading
    ? { kind: "loading", message: "loading…" }
    : writeError != null
      ? { kind: "err", message: writeError }
      : error != null
        ? { kind: "err", message: error }
        : { kind: "ok", message: `${visible.length} bookmarks` };

  const filteredFile = bookmarksFile != null
    ? { ...bookmarksFile, bookmarks: searched }
    : null;

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

  function ids(): string[] {
    return [...selection.selected];
  }

  async function runBulk(
    message: string,
    mutator: (f: BookmarksFile) => BookmarksFile,
  ) {
    setWriteError(null);
    setWriting(true);
    try {
      await writeBookmarks(mutator, message);
      selection.clear();
    } catch (err) {
      setWriteError(err instanceof Error ? err.message : String(err));
    } finally {
      setWriting(false);
    }
  }

  return (
    <Layout status={status} onRefresh={onRefresh} onExport={onExport} onSignOut={onSignOut} refreshing={refreshing} busy={writing}>
      <div data-testid="list-page" className="grid grid-cols-[12rem_1fr] gap-4 p-4">
        <aside className="border-r border-fog pr-4">
          <h2 className="text-magenta text-sm uppercase mb-2">Tags</h2>
          {tagsFile != null && (
            <TagFilter
              used={used}
              tagsFile={tagsFile}
              selected={selectedTag}
              onSelect={setSelectedTag}
            />
          )}
        </aside>
        <section>
          <SearchBar value={query} onChange={setQuery} />
          {selection.selected.size > 0 && tagsFile != null && (
            <BulkActionsBar
              count={selection.selected.size}
              tagsFile={tagsFile}
              onAddTag={(tag) =>
                runBulk(`bulk: add tag ${tag}`, bulkAddTag(ids(), tag, new Date().toISOString()))
              }
              onRemoveTag={(tag) =>
                runBulk(`bulk: remove tag ${tag}`, bulkRemoveTag(ids(), tag, new Date().toISOString()))
              }
              onSetFolder={(folder) =>
                runBulk(`bulk: set folder ${folder}`, bulkSetFolder(ids(), folder, new Date().toISOString()))
              }
              onDelete={() =>
                runBulk(`bulk: move ${ids().length} to trash`, bulkSoftDelete(ids(), new Date().toISOString()))
              }
              onClear={() => selection.clear()}
            />
          )}
          {filteredFile != null && tagsFile != null && (
            <div className="mt-4">
              <BookmarkList
                bookmarksFile={filteredFile}
                tagsFile={tagsFile}
                selected={selection.selected}
                onToggleSelect={selection.toggle}
                onSetAll={(idsList) => selection.setAll(idsList)}
              />
            </div>
          )}
        </section>
      </div>
    </Layout>
  );
}
