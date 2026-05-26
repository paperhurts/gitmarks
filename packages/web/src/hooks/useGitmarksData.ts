import { useCallback, useEffect, useRef, useState } from "react";
import {
  GitHubNotFoundError,
  bookmarksFileSchema,
  tagsFileSchema,
} from "@gitmarks/core";
import type { BookmarksFile, GitHubClient, TagsFile } from "@gitmarks/core";

const EMPTY_BOOKMARKS: BookmarksFile = { version: 1, updated_at: "", bookmarks: [] };
const EMPTY_TAGS: TagsFile = { version: 1, tags: {} };

interface Loaded<T> {
  data: T;
  etag: string;
  sha: string;
}

async function readBookmarksOrEmpty(client: GitHubClient): Promise<Loaded<BookmarksFile>> {
  try {
    const result = await client.read<unknown>("bookmarks.json");
    const parsed = bookmarksFileSchema.safeParse(result.data);
    if (!parsed.success) {
      throw new Error(
        `bookmarks.json failed schema validation: ${parsed.error.issues[0]?.message ?? "unknown"}`,
      );
    }
    return { data: parsed.data, etag: result.etag, sha: result.sha };
  } catch (err) {
    if (err instanceof GitHubNotFoundError) return { data: EMPTY_BOOKMARKS, etag: "", sha: "" };
    throw err;
  }
}

async function readTagsOrEmpty(client: GitHubClient): Promise<Loaded<TagsFile>> {
  try {
    const result = await client.read<unknown>("tags.json");
    const parsed = tagsFileSchema.safeParse(result.data);
    if (!parsed.success) {
      throw new Error(
        `tags.json failed schema validation: ${parsed.error.issues[0]?.message ?? "unknown"}`,
      );
    }
    return { data: parsed.data, etag: result.etag, sha: result.sha };
  } catch (err) {
    if (err instanceof GitHubNotFoundError) return { data: EMPTY_TAGS, etag: "", sha: "" };
    throw err;
  }
}

export interface UseGitmarksData {
  bookmarksFile: BookmarksFile | null;
  tagsFile: TagsFile | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  writeBookmarks: (
    mutate: (f: BookmarksFile) => BookmarksFile,
    message: string,
  ) => Promise<void>;
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
      // (created on first tag-manager mutation). Schema failures and all other
      // errors propagate to the catch block and surface as an error message.
      const [b, t] = await Promise.all([
        readBookmarksOrEmpty(client),
        readTagsOrEmpty(client),
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

  const writeBookmarks = useCallback(
    async (mutate: (f: BookmarksFile) => BookmarksFile, message: string) => {
      const result = await client.update<BookmarksFile>("bookmarks.json", mutate, message);
      if (!mounted.current) return;
      setBookmarks({ data: result.data, etag: result.etag, sha: result.sha });
    },
    [client],
  );

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
    writeBookmarks,
    writeTags,
  };
}
