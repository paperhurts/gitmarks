import { useCallback, useEffect, useRef, useState } from "react";
import { GitHubNotFoundError } from "@gitmarks/core";
import type { BookmarksFile, GitHubClient, TagsFile } from "@gitmarks/core";

const EMPTY_BOOKMARKS: BookmarksFile = { version: 1, updated_at: "", bookmarks: [] };
const EMPTY_TAGS: TagsFile = { version: 1, tags: {} };

async function readOrEmpty<T>(
  client: GitHubClient,
  path: string,
  empty: T,
): Promise<{ data: T; etag: string; sha: string }> {
  try {
    return await client.read<T>(path);
  } catch (err) {
    if (err instanceof GitHubNotFoundError) return { data: empty, etag: "", sha: "" };
    throw err;
  }
}

interface Loaded<T> {
  data: T;
  etag: string;
  sha: string;
}

export interface UseGitmarksData {
  bookmarksFile: BookmarksFile | null;
  tagsFile: TagsFile | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  writeTags: (
    mutate: (f: TagsFile) => TagsFile,
    message: string,
  ) => Promise<void>;
}

export function useGitmarksData(client: GitHubClient): UseGitmarksData {
  const [bookmarks, setBookmarks] = useState<Loaded<BookmarksFile> | null>(null);
  const [tags, setTags] = useState<Loaded<TagsFile> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 404 on either file is treated as empty — a freshly-set-up repo may not
      // have bookmarks.json yet (extension creates it on first save) or tags.json
      // (created on first tag-manager mutation). All other errors propagate.
      const [b, t] = await Promise.all([
        readOrEmpty<BookmarksFile>(client, "bookmarks.json", EMPTY_BOOKMARKS),
        readOrEmpty<TagsFile>(client, "tags.json", EMPTY_TAGS),
      ]);
      if (!mounted.current) return;
      setBookmarks({ data: b.data, etag: b.etag, sha: b.sha });
      setTags({ data: t.data, etag: t.etag, sha: t.sha });
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [client]);

  const refresh = useCallback(async () => {
    if (bookmarks == null) return loadInitial();
    setError(null);
    try {
      const [b, t] = await Promise.all([
        client.readIfChanged<BookmarksFile>("bookmarks.json", bookmarks.etag),
        tags != null && tags.etag.length > 0
          ? client.readIfChanged<TagsFile>("tags.json", tags.etag)
          : client.read<TagsFile>("tags.json").catch(() => null),
      ]);
      if (!mounted.current) return;
      if (b != null) setBookmarks({ data: b.data, etag: b.etag, sha: b.sha });
      if (t != null) setTags({ data: t.data, etag: t.etag, sha: t.sha });
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [bookmarks, tags, client, loadInitial]);

  const writeTags = useCallback(
    async (mutate: (f: TagsFile) => TagsFile, message: string) => {
      const result = await client.update<TagsFile>("tags.json", mutate, message);
      if (!mounted.current) return;
      setTags({ data: result.data, etag: result.etag, sha: result.sha });
    },
    [client],
  );

  useEffect(() => {
    mounted.current = true;
    void loadInitial();
    return () => {
      mounted.current = false;
    };
  }, [loadInitial]);

  return {
    bookmarksFile: bookmarks?.data ?? null,
    tagsFile: tags?.data ?? null,
    loading,
    error,
    refresh,
    writeTags,
  };
}
