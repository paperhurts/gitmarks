import { useMemo, useState } from "react";
import type { GitHubClient } from "@gitmarks/core";
import { useGitmarksData } from "../hooks/useGitmarksData.js";
import { BookmarkList } from "../components/BookmarkList.js";
import { SearchBar } from "../components/SearchBar.js";
import { TagFilter } from "../components/TagFilter.js";
import { Layout, type LayoutStatus } from "../components/Layout.js";
import { allUsedTags, searchBookmarks, visibleBookmarks } from "../lib/data.js";

interface Props {
  client: GitHubClient;
}

export function ListPage({ client }: Props) {
  const { bookmarksFile, tagsFile, loading, error, refresh } = useGitmarksData(client);
  const [query, setQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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

  return (
    <Layout status={status} onRefresh={onRefresh} refreshing={refreshing}>
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
          {filteredFile != null && tagsFile != null && (
            <div className="mt-4">
              <BookmarkList bookmarksFile={filteredFile} tagsFile={tagsFile} />
            </div>
          )}
        </section>
      </div>
    </Layout>
  );
}
