# Web UI v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship write-side features for `@gitmarks/web`: bulk operations on the listing, a trash view with restore, and Netscape HTML export.

**Architecture:** Extend existing `@gitmarks/web` with multi-select state, a `BulkActionsBar`, and a `/trash` route. All writes go through `client.update("bookmarks.json", …)` from `@gitmarks/core` for 409 retry-replay. Add pure bulk mutators to `@gitmarks/core` so they sit alongside the existing single-item mutations and are reusable by future clients. Netscape HTML export is a pure utility plus a single Blob-download button.

**Tech Stack:** Same as v1 — Vite 5, React 18, TypeScript 5.4, Tailwind 3, `@gitmarks/core` (workspace), Vitest 2 + jsdom + @testing-library/react.

**Scope (in):**
- Multi-select UX on the list page (checkbox per row, select-all, clear-selection)
- Bulk add tag / remove tag / set folder / move to trash (one batched `client.update()` per bulk action — single commit on GitHub)
- `/trash` route: list `deleted_at != null` (within the 30-day GC window), single + bulk restore
- Netscape HTML export — pure generator, browser download via Blob
- Nav links: List / Tags / Trash / Export

**Scope (out, deferred):**
- Permanent delete from trash (the extension's `gcTombstones` handles GC after 30 days)
- Tag rename "and update bookmark refs" — still decoupled per spec
- Conflict UI beyond what `client.update`'s retry already provides

**Branch:** `feat/web-ui-v2`

---

## File Structure

```
packages/core/src/
  mutate.ts                  # ADD: updateBookmarks, restoreBookmark
  index.ts                   # ADD: re-export updateBookmarks, restoreBookmark

packages/web/src/
  hooks/
    useGitmarksData.ts       # MODIFY: add writeBookmarks
    useSelection.ts          # NEW: Set<string> selection state
  lib/
    bulk-mutations.ts        # NEW: pure factories — addTagToMany, removeTagFromMany, setFolderForMany, softDeleteMany, restoreMany
    netscape-export.ts       # NEW: BookmarksFile → Netscape HTML string
    download.ts              # NEW: trigger browser download from a string blob
  components/
    BookmarkRow.tsx          # MODIFY: optional selected + onToggleSelect props (checkbox column)
    BookmarkList.tsx         # MODIFY: pass selection through, render select-all header when used
    BulkActionsBar.tsx       # NEW: visible when selection > 0; add/remove tag, set folder, delete, clear
    TrashRow.tsx             # NEW: row variant for trash listing (no edit, has restore button)
    TrashList.tsx            # NEW: filter to deleted bookmarks within GC window
    Layout.tsx               # MODIFY: add Trash nav link + Export button
  routes/
    ListPage.tsx             # MODIFY: useSelection + BulkActionsBar
    TrashPage.tsx            # NEW: filter deleted, restore actions
    SetupPage.tsx, TagsPage.tsx  # unchanged
  App.tsx                    # MODIFY: add /trash route
  ...
packages/web/test/
  hooks.useGitmarksData.test.ts   # ADD writeBookmarks tests
  hooks.useSelection.test.ts      # NEW
  lib.bulk-mutations.test.ts      # NEW
  lib.netscape-export.test.ts     # NEW
  components.BulkActionsBar.test.tsx  # NEW
  components.TrashList.test.tsx   # NEW
  ListPage.integration.test.tsx   # ADD bulk-selection tests
```

Other files modified:
- `README.md` — feature list + roadmap line for #25
- `CLAUDE.md` — `@gitmarks/web` subsection: mention bulk + trash + export
- `packages/web/README.md` — add v2 routes + smoke test extensions

---

## Task 1: Core — `updateBookmarks` and `restoreBookmark` pure mutations

**Files:**
- Modify: `packages/core/src/mutate.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/test/mutate.test.ts`

- [ ] **Step 1: Write the failing tests**

Open `packages/core/test/mutate.test.ts`. After the existing tests, append:

```typescript
import { restoreBookmark, updateBookmarks } from "../src/mutate.js";

describe("updateBookmarks (bulk)", () => {
  it("applies a patch to every listed id and stamps updated_at", () => {
    const file: BookmarksFile = {
      version: 1,
      updated_at: "2026-01-01T00:00:00Z",
      bookmarks: [
        { ...sampleBookmark, id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CA" },
        { ...sampleBookmark, id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CB" },
        { ...sampleBookmark, id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CC" },
      ],
    };
    const next = updateBookmarks(
      file,
      [
        { id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CA", patch: { folder: "Archive" } },
        { id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CC", patch: { tags: ["x"] } },
      ],
      "2026-05-25T00:00:00Z",
    );
    expect(next.bookmarks[0]!.folder).toBe("Archive");
    expect(next.bookmarks[0]!.updated_at).toBe("2026-05-25T00:00:00Z");
    expect(next.bookmarks[1]!.folder).toBe(file.bookmarks[1]!.folder); // unchanged
    expect(next.bookmarks[2]!.tags).toEqual(["x"]);
    expect(next.updated_at).toBe("2026-05-25T00:00:00Z");
  });

  it("throws when any id is missing", () => {
    const file: BookmarksFile = {
      version: 1,
      updated_at: "2026-01-01T00:00:00Z",
      bookmarks: [{ ...sampleBookmark, id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CA" }],
    };
    expect(() =>
      updateBookmarks(file, [{ id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CZ", patch: {} }], "2026-05-25T00:00:00Z"),
    ).toThrow(/not found/);
  });

  it("no-ops on empty patch list but stamps updated_at", () => {
    const file: BookmarksFile = {
      version: 1,
      updated_at: "2026-01-01T00:00:00Z",
      bookmarks: [{ ...sampleBookmark, id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CA" }],
    };
    const next = updateBookmarks(file, [], "2026-05-25T00:00:00Z");
    expect(next.updated_at).toBe("2026-05-25T00:00:00Z");
    expect(next.bookmarks).toEqual(file.bookmarks);
  });

  it("does not mutate the input", () => {
    const file: BookmarksFile = {
      version: 1,
      updated_at: "2026-01-01T00:00:00Z",
      bookmarks: [{ ...sampleBookmark, id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CA", folder: "" }],
    };
    updateBookmarks(file, [{ id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CA", patch: { folder: "X" } }], "2026-05-25T00:00:00Z");
    expect(file.bookmarks[0]!.folder).toBe("");
  });
});

describe("restoreBookmark", () => {
  it("clears deleted_at and updates updated_at", () => {
    const file: BookmarksFile = {
      version: 1,
      updated_at: "2026-01-01T00:00:00Z",
      bookmarks: [
        { ...sampleBookmark, id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CA", deleted_at: "2026-04-01T00:00:00Z" },
      ],
    };
    const next = restoreBookmark(file, "01HXYZ8K7M9P3RQ2V5W6Z8B0CA", "2026-05-25T00:00:00Z");
    expect(next.bookmarks[0]!.deleted_at).toBeNull();
    expect(next.bookmarks[0]!.updated_at).toBe("2026-05-25T00:00:00Z");
  });

  it("throws when the id is missing", () => {
    const file: BookmarksFile = {
      version: 1,
      updated_at: "2026-01-01T00:00:00Z",
      bookmarks: [],
    };
    expect(() => restoreBookmark(file, "01HXYZ8K7M9P3RQ2V5W6Z8B0CZ", "2026-05-25T00:00:00Z")).toThrow(/not found/);
  });
});
```

If the existing test file doesn't already have a `sampleBookmark` fixture, the implementer should define one or reuse the existing fixture name. Check the file first.

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @gitmarks/core test
```

Expected: FAIL on `updateBookmarks is not a function` / `restoreBookmark is not a function`.

- [ ] **Step 3: Implement** — append to `packages/core/src/mutate.ts`:

```typescript
export interface BookmarkPatch {
  id: string;
  patch: Partial<Omit<Bookmark, "id">>;
}

export function updateBookmarks(
  file: BookmarksFile,
  patches: BookmarkPatch[],
  nowIso: string,
): BookmarksFile {
  if (patches.length === 0) {
    return { ...file, updated_at: nowIso };
  }
  const byId = new Map<string, Partial<Omit<Bookmark, "id">>>();
  for (const p of patches) byId.set(p.id, p.patch);
  const next = file.bookmarks.map((b) => {
    const patch = byId.get(b.id);
    if (patch === undefined) return b;
    byId.delete(b.id);
    return { ...b, ...patch, updated_at: nowIso };
  });
  if (byId.size > 0) {
    const missing = [...byId.keys()].join(", ");
    throw new Error(`bookmark not found: ${missing}`);
  }
  return { ...file, updated_at: nowIso, bookmarks: next };
}

export function restoreBookmark(
  file: BookmarksFile,
  id: string,
  nowIso: string,
): BookmarksFile {
  return updateBookmark(file, id, { deleted_at: null }, nowIso);
}
```

- [ ] **Step 4: Re-export from `packages/core/src/index.ts`**

Find the existing `mutate.js` re-export block and extend it:

```typescript
export {
  addBookmark,
  updateBookmark,
  updateBookmarks,
  type BookmarkPatch,
  softDeleteBookmark,
  restoreBookmark,
  gcTombstones,
} from "./mutate.js";
```

- [ ] **Step 5: Run tests + typecheck + build**

```bash
pnpm --filter @gitmarks/core test
pnpm --filter @gitmarks/core typecheck
pnpm --filter @gitmarks/core build
```

All green. Core gains 6 new tests.

- [ ] **Step 6: Branch + commit**

```bash
git checkout -b feat/web-ui-v2
git add packages/core/src/mutate.ts packages/core/src/index.ts packages/core/test/mutate.test.ts
git commit -m "feat(core): add updateBookmarks (bulk) and restoreBookmark pure mutations"
```

---

## Task 2: Web — `writeBookmarks` on `useGitmarksData`

**Files:**
- Modify: `packages/web/src/hooks/useGitmarksData.ts`
- Modify: `packages/web/test/hooks.useGitmarksData.test.ts`

- [ ] **Step 1: Add a failing test for `writeBookmarks`**

Append to `packages/web/test/hooks.useGitmarksData.test.ts` inside the existing `describe("useGitmarksData", …)` block (before the closing `});`):

```typescript
  it("writeBookmarks() calls client.update on bookmarks.json with the mutator", async () => {
    const updatedFile: BookmarksFile = {
      version: 1,
      updated_at: "2026-05-25T00:00:00Z",
      bookmarks: [],
    };
    const update = vi.fn().mockResolvedValue({ data: updatedFile, sha: "b2", etag: '"b2"' });
    const client = fakeClient({ update } as any);
    const { result } = renderHook(() => useGitmarksData(client));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const mutator = (f: BookmarksFile) => f;
    await act(async () => {
      await result.current.writeBookmarks(mutator, "bulk: move to trash");
    });

    expect(update).toHaveBeenCalledWith("bookmarks.json", mutator, "bulk: move to trash");
    expect(result.current.bookmarksFile).toEqual(updatedFile);
  });
```

Run: `pnpm --filter @gitmarks/web test test/hooks.useGitmarksData.test.ts` — should FAIL on `result.current.writeBookmarks is not a function`.

- [ ] **Step 2: Extend the hook**

Open `packages/web/src/hooks/useGitmarksData.ts`. Modify the `UseGitmarksData` interface and add the `writeBookmarks` implementation, mirroring `writeTags`:

```typescript
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
```

Below `writeTags`, before the `useEffect`, add:

```typescript
  const writeBookmarks = useCallback(
    async (mutate: (f: BookmarksFile) => BookmarksFile, message: string) => {
      const result = await client.update<BookmarksFile>("bookmarks.json", mutate, message);
      if (!mounted.current) return;
      setBookmarks({ data: result.data, etag: result.etag, sha: result.sha });
    },
    [client],
  );
```

Add `writeBookmarks` to the returned object:

```typescript
  return {
    bookmarksFile: bookmarks?.data ?? null,
    tagsFile: tags?.data ?? null,
    loading,
    error,
    refresh,
    writeBookmarks,
    writeTags,
  };
```

- [ ] **Step 3: Verify**

```bash
pnpm --filter @gitmarks/web test
pnpm --filter @gitmarks/web typecheck
```

All previous tests + 1 new = pass.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/hooks/useGitmarksData.ts packages/web/test/hooks.useGitmarksData.test.ts
git commit -m "feat(web): add writeBookmarks to useGitmarksData hook"
```

---

## Task 3: `useSelection` hook

**Files:**
- Create: `packages/web/src/hooks/useSelection.ts`
- Create: `packages/web/test/hooks.useSelection.test.ts`

- [ ] **Step 1: Write the failing test** — `packages/web/test/hooks.useSelection.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSelection } from "../src/hooks/useSelection.js";

describe("useSelection", () => {
  it("starts empty", () => {
    const { result } = renderHook(() => useSelection());
    expect(result.current.selected.size).toBe(0);
  });

  it("toggle adds then removes", () => {
    const { result } = renderHook(() => useSelection());
    act(() => result.current.toggle("a"));
    expect(result.current.selected.has("a")).toBe(true);
    act(() => result.current.toggle("a"));
    expect(result.current.selected.has("a")).toBe(false);
  });

  it("setAll replaces selection", () => {
    const { result } = renderHook(() => useSelection());
    act(() => result.current.setAll(["a", "b", "c"]));
    expect(result.current.selected.size).toBe(3);
    act(() => result.current.setAll(["d"]));
    expect([...result.current.selected]).toEqual(["d"]);
  });

  it("clear empties the selection", () => {
    const { result } = renderHook(() => useSelection());
    act(() => result.current.setAll(["a", "b"]));
    act(() => result.current.clear());
    expect(result.current.selected.size).toBe(0);
  });

  it("isSelected reflects state", () => {
    const { result } = renderHook(() => useSelection());
    act(() => result.current.toggle("x"));
    expect(result.current.isSelected("x")).toBe(true);
    expect(result.current.isSelected("y")).toBe(false);
  });
});
```

Run: `pnpm --filter @gitmarks/web test test/hooks.useSelection.test.ts` — should FAIL on missing module.

- [ ] **Step 2: Implement** — `packages/web/src/hooks/useSelection.ts`:

```typescript
import { useCallback, useState } from "react";

export interface UseSelection {
  selected: ReadonlySet<string>;
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  setAll: (ids: readonly string[]) => void;
  clear: () => void;
}

export function useSelection(): UseSelection {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const setAll = useCallback((ids: readonly string[]) => {
    setSelected(new Set(ids));
  }, []);

  const clear = useCallback(() => {
    setSelected(new Set());
  }, []);

  const isSelected = useCallback((id: string) => selected.has(id), [selected]);

  return { selected, isSelected, toggle, setAll, clear };
}
```

- [ ] **Step 3: Verify**

```bash
pnpm --filter @gitmarks/web test
```

5 new tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/hooks/useSelection.ts packages/web/test/hooks.useSelection.test.ts
git commit -m "feat(web): add useSelection hook for multi-select state"
```

---

## Task 4: Pure bulk mutation factories

**Files:**
- Create: `packages/web/src/lib/bulk-mutations.ts`
- Create: `packages/web/test/lib.bulk-mutations.test.ts`

These functions return `(file: BookmarksFile) => BookmarksFile` mutators suitable for passing to `client.update`. They close over the selected ids + arguments, but the produced mutators are pure (so they can be replayed on 409).

- [ ] **Step 1: Write the failing tests** — `packages/web/test/lib.bulk-mutations.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import type { Bookmark, BookmarksFile } from "@gitmarks/core";
import {
  bulkAddTag,
  bulkRemoveTag,
  bulkSetFolder,
  bulkSoftDelete,
  bulkRestore,
} from "../src/lib/bulk-mutations.js";

function mk(over: Partial<Bookmark> = {}): Bookmark {
  return {
    id: "01HXYZ8K7M9P3RQ2V5W6Z8B0C1",
    url: "https://example.com/",
    title: "Example",
    folder: "",
    tags: [],
    added_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
    added_from: "chrome@minerva",
    deleted_at: null,
    notes: null,
    ...over,
  };
}

const file: BookmarksFile = {
  version: 1,
  updated_at: "2026-05-23T00:00:00Z",
  bookmarks: [
    mk({ id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CA", tags: ["daily"] }),
    mk({ id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CB", tags: ["daily", "to-read"] }),
    mk({ id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CC", tags: [] }),
    mk({ id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CD", deleted_at: "2026-05-20T00:00:00Z" }),
  ],
};

const now = "2026-05-25T00:00:00Z";

describe("bulkAddTag", () => {
  it("adds a tag to each selected bookmark without duplicating", () => {
    const mutator = bulkAddTag(["01HXYZ8K7M9P3RQ2V5W6Z8B0CA", "01HXYZ8K7M9P3RQ2V5W6Z8B0CB", "01HXYZ8K7M9P3RQ2V5W6Z8B0CC"], "daily", now);
    const next = mutator(file);
    expect(next.bookmarks[0]!.tags).toEqual(["daily"]);
    expect(next.bookmarks[1]!.tags).toEqual(["daily", "to-read"]);
    expect(next.bookmarks[2]!.tags).toEqual(["daily"]);
  });

  it("returned mutator is pure (same input → same output)", () => {
    const mutator = bulkAddTag(["01HXYZ8K7M9P3RQ2V5W6Z8B0CA"], "new", now);
    expect(mutator(file)).toEqual(mutator(file));
  });
});

describe("bulkRemoveTag", () => {
  it("removes the tag from each selected bookmark; no-op when absent", () => {
    const mutator = bulkRemoveTag(["01HXYZ8K7M9P3RQ2V5W6Z8B0CA", "01HXYZ8K7M9P3RQ2V5W6Z8B0CB", "01HXYZ8K7M9P3RQ2V5W6Z8B0CC"], "daily", now);
    const next = mutator(file);
    expect(next.bookmarks[0]!.tags).toEqual([]);
    expect(next.bookmarks[1]!.tags).toEqual(["to-read"]);
    expect(next.bookmarks[2]!.tags).toEqual([]);
  });
});

describe("bulkSetFolder", () => {
  it("sets folder on each selected bookmark", () => {
    const mutator = bulkSetFolder(["01HXYZ8K7M9P3RQ2V5W6Z8B0CA", "01HXYZ8K7M9P3RQ2V5W6Z8B0CB"], "Archive", now);
    const next = mutator(file);
    expect(next.bookmarks[0]!.folder).toBe("Archive");
    expect(next.bookmarks[1]!.folder).toBe("Archive");
    expect(next.bookmarks[2]!.folder).toBe("");
  });
});

describe("bulkSoftDelete", () => {
  it("sets deleted_at on each selected bookmark", () => {
    const mutator = bulkSoftDelete(["01HXYZ8K7M9P3RQ2V5W6Z8B0CA", "01HXYZ8K7M9P3RQ2V5W6Z8B0CB"], now);
    const next = mutator(file);
    expect(next.bookmarks[0]!.deleted_at).toBe(now);
    expect(next.bookmarks[1]!.deleted_at).toBe(now);
    expect(next.bookmarks[2]!.deleted_at).toBeNull();
  });
});

describe("bulkRestore", () => {
  it("clears deleted_at on each selected bookmark", () => {
    const mutator = bulkRestore(["01HXYZ8K7M9P3RQ2V5W6Z8B0CD"], now);
    const next = mutator(file);
    expect(next.bookmarks[3]!.deleted_at).toBeNull();
    expect(next.bookmarks[3]!.updated_at).toBe(now);
  });

  it("throws via updateBookmarks when an id is missing", () => {
    const mutator = bulkRestore(["01HXYZ8K7M9P3RQ2V5W6Z8B0CZ"], now);
    expect(() => mutator(file)).toThrow(/not found/);
  });
});
```

Run: `pnpm --filter @gitmarks/web test test/lib.bulk-mutations.test.ts` — should FAIL on missing module.

- [ ] **Step 2: Implement** — `packages/web/src/lib/bulk-mutations.ts`:

```typescript
import type { BookmarksFile } from "@gitmarks/core";
import { updateBookmarks } from "@gitmarks/core";

type Mutator = (file: BookmarksFile) => BookmarksFile;

export function bulkAddTag(ids: string[], tag: string, nowIso: string): Mutator {
  return (file) =>
    updateBookmarks(
      file,
      ids.map((id) => {
        const existing = file.bookmarks.find((b) => b.id === id);
        const tags = existing?.tags ?? [];
        const nextTags = tags.includes(tag) ? tags : [...tags, tag];
        return { id, patch: { tags: nextTags } };
      }),
      nowIso,
    );
}

export function bulkRemoveTag(ids: string[], tag: string, nowIso: string): Mutator {
  return (file) =>
    updateBookmarks(
      file,
      ids.map((id) => {
        const existing = file.bookmarks.find((b) => b.id === id);
        const tags = existing?.tags ?? [];
        return { id, patch: { tags: tags.filter((t) => t !== tag) } };
      }),
      nowIso,
    );
}

export function bulkSetFolder(ids: string[], folder: string, nowIso: string): Mutator {
  return (file) => updateBookmarks(file, ids.map((id) => ({ id, patch: { folder } })), nowIso);
}

export function bulkSoftDelete(ids: string[], nowIso: string): Mutator {
  return (file) => updateBookmarks(file, ids.map((id) => ({ id, patch: { deleted_at: nowIso } })), nowIso);
}

export function bulkRestore(ids: string[], nowIso: string): Mutator {
  return (file) => updateBookmarks(file, ids.map((id) => ({ id, patch: { deleted_at: null } })), nowIso);
}
```

- [ ] **Step 3: Verify**

```bash
pnpm --filter @gitmarks/web test
pnpm --filter @gitmarks/web typecheck
```

All previous + new tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/lib/bulk-mutations.ts packages/web/test/lib.bulk-mutations.test.ts
git commit -m "feat(web): pure bulk-mutation factories built on core's updateBookmarks"
```

---

## Task 5: BookmarkRow selection prop + select-all in BookmarkList

**Files:**
- Modify: `packages/web/src/components/BookmarkRow.tsx`
- Modify: `packages/web/src/components/BookmarkList.tsx`
- Modify: `packages/web/test/components.BookmarkList.test.tsx`

- [ ] **Step 1: Add a failing test for selection rendering**

In `packages/web/test/components.BookmarkList.test.tsx`, add a new test inside the existing `describe`:

```typescript
  it("renders a checkbox per row when onToggleSelect is provided", () => {
    const onToggleSelect = vi.fn();
    render(
      <BookmarkList
        bookmarksFile={bookmarks}
        tagsFile={tags}
        selected={new Set()}
        onToggleSelect={onToggleSelect}
      />,
    );
    const checkboxes = screen.getAllByRole("checkbox");
    // 1 row checkbox + 1 select-all = 2
    expect(checkboxes.length).toBeGreaterThanOrEqual(2);
  });

  it("calls onToggleSelect with the bookmark id when its checkbox is clicked", async () => {
    const user = userEvent.setup();
    const onToggleSelect = vi.fn();
    render(
      <BookmarkList
        bookmarksFile={bookmarks}
        tagsFile={tags}
        selected={new Set()}
        onToggleSelect={onToggleSelect}
      />,
    );
    const rowCheckbox = screen.getByLabelText(/select hacker news/i);
    await user.click(rowCheckbox);
    expect(onToggleSelect).toHaveBeenCalledWith("01HXYZ8K7M9P3RQ2V5W6Z8B0CA");
  });

  it("renders no checkboxes when onToggleSelect is not provided", () => {
    render(<BookmarkList bookmarksFile={bookmarks} tagsFile={tags} />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
```

Add the userEvent import at the top of the test if not present:

```typescript
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
```

Run: `pnpm --filter @gitmarks/web test test/components.BookmarkList.test.tsx` — should FAIL because props don't exist.

- [ ] **Step 2: Update `BookmarkRow.tsx`** — add optional selection props:

```typescript
import type { Bookmark, TagsFile } from "@gitmarks/core";
import { TagChip } from "./TagChip.js";

interface Props {
  bookmark: Bookmark;
  tagsFile: TagsFile;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}

export function BookmarkRow({ bookmark, tagsFile, selected, onToggleSelect }: Props) {
  const folder = bookmark.folder.length > 0 ? bookmark.folder : "(root)";
  const showCheckbox = onToggleSelect !== undefined;
  return (
    <li className="border-b border-fog px-4 py-3 hover:bg-mist transition-colors flex gap-3">
      {showCheckbox && (
        <input
          type="checkbox"
          aria-label={`select ${bookmark.title}`}
          checked={selected ?? false}
          onChange={() => onToggleSelect(bookmark.id)}
          className="mt-1.5"
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-3">
          <a
            href={bookmark.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan hover:text-magenta truncate flex-1"
          >
            {bookmark.title}
          </a>
          <span className="text-xs text-cyan-soft/60">{folder}</span>
        </div>
        <div className="text-xs text-cyan-soft/40 truncate mt-1">{bookmark.url}</div>
        {bookmark.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {bookmark.tags.map((t) => (
              <TagChip key={t} name={t} tagsFile={tagsFile} />
            ))}
          </div>
        )}
        {bookmark.notes != null && (
          <p className="text-xs text-cyan-soft/70 italic mt-1">{bookmark.notes}</p>
        )}
      </div>
    </li>
  );
}
```

- [ ] **Step 3: Update `BookmarkList.tsx`** — pass selection through and add select-all header:

```typescript
import type { BookmarksFile, TagsFile } from "@gitmarks/core";
import { BookmarkRow } from "./BookmarkRow.js";
import { visibleBookmarks } from "../lib/data.js";

interface Props {
  bookmarksFile: BookmarksFile;
  tagsFile: TagsFile;
  selected?: ReadonlySet<string>;
  onToggleSelect?: (id: string) => void;
  onSetAll?: (ids: string[]) => void;
}

export function BookmarkList({
  bookmarksFile,
  tagsFile,
  selected,
  onToggleSelect,
  onSetAll,
}: Props) {
  const items = visibleBookmarks(bookmarksFile);
  if (items.length === 0) {
    return (
      <p className="p-6 text-cyan-soft/60">
        No bookmarks yet. Save one from a browser extension to see it here.
      </p>
    );
  }
  const showSelectAll = onToggleSelect !== undefined && onSetAll !== undefined;
  const allSelected =
    showSelectAll && selected !== undefined && items.every((b) => selected.has(b.id));
  return (
    <div>
      {showSelectAll && (
        <div className="border-b border-fog px-4 py-2 flex items-center gap-3 text-xs text-cyan-soft/60">
          <input
            type="checkbox"
            aria-label="select all"
            checked={allSelected}
            onChange={() => onSetAll(allSelected ? [] : items.map((b) => b.id))}
          />
          <span>{selected?.size ?? 0} selected</span>
        </div>
      )}
      <ul className="divide-y divide-fog">
        {items.map((b) => (
          <BookmarkRow
            key={b.id}
            bookmark={b}
            tagsFile={tagsFile}
            {...(onToggleSelect !== undefined
              ? { selected: selected?.has(b.id) ?? false, onToggleSelect }
              : {})}
          />
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Verify**

```bash
pnpm --filter @gitmarks/web test
pnpm --filter @gitmarks/web typecheck
```

All previous + 3 new BookmarkList tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/BookmarkRow.tsx packages/web/src/components/BookmarkList.tsx packages/web/test/components.BookmarkList.test.tsx
git commit -m "feat(web): optional selection props on BookmarkRow + select-all header"
```

---

## Task 6: BulkActionsBar component

**Files:**
- Create: `packages/web/src/components/BulkActionsBar.tsx`
- Create: `packages/web/test/components.BulkActionsBar.test.tsx`

- [ ] **Step 1: Write the failing test** — `packages/web/test/components.BulkActionsBar.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TagsFile } from "@gitmarks/core";
import { BulkActionsBar } from "../src/components/BulkActionsBar.js";

const tagsFile: TagsFile = {
  version: 1,
  tags: {
    daily: { color: "#00FFFF", description: null },
    reference: { color: "#00FF88", description: null },
  },
};

function noopHandlers() {
  return {
    onAddTag: vi.fn().mockResolvedValue(undefined),
    onRemoveTag: vi.fn().mockResolvedValue(undefined),
    onSetFolder: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn().mockResolvedValue(undefined),
    onClear: vi.fn(),
  };
}

describe("BulkActionsBar", () => {
  it("shows the selection count", () => {
    render(
      <BulkActionsBar
        count={3}
        tagsFile={tagsFile}
        {...noopHandlers()}
      />,
    );
    expect(screen.getByText(/3 selected/i)).toBeInTheDocument();
  });

  it("calls onAddTag with the typed tag", async () => {
    const user = userEvent.setup();
    const handlers = noopHandlers();
    render(<BulkActionsBar count={2} tagsFile={tagsFile} {...handlers} />);
    await user.type(screen.getByLabelText(/add tag/i), "weekly");
    await user.click(screen.getByRole("button", { name: /^add$/i }));
    expect(handlers.onAddTag).toHaveBeenCalledWith("weekly");
  });

  it("calls onRemoveTag with the picked tag", async () => {
    const user = userEvent.setup();
    const handlers = noopHandlers();
    render(<BulkActionsBar count={2} tagsFile={tagsFile} {...handlers} />);
    await user.selectOptions(screen.getByLabelText(/remove tag/i), "reference");
    await user.click(screen.getByRole("button", { name: /^remove$/i }));
    expect(handlers.onRemoveTag).toHaveBeenCalledWith("reference");
  });

  it("calls onSetFolder with the typed folder", async () => {
    const user = userEvent.setup();
    const handlers = noopHandlers();
    render(<BulkActionsBar count={2} tagsFile={tagsFile} {...handlers} />);
    await user.type(screen.getByLabelText(/set folder/i), "Archive");
    await user.click(screen.getByRole("button", { name: /^set$/i }));
    expect(handlers.onSetFolder).toHaveBeenCalledWith("Archive");
  });

  it("calls onDelete when Move to trash is clicked", async () => {
    const user = userEvent.setup();
    const handlers = noopHandlers();
    render(<BulkActionsBar count={2} tagsFile={tagsFile} {...handlers} />);
    await user.click(screen.getByRole("button", { name: /move to trash/i }));
    expect(handlers.onDelete).toHaveBeenCalled();
  });

  it("calls onClear when Clear is clicked", async () => {
    const user = userEvent.setup();
    const handlers = noopHandlers();
    render(<BulkActionsBar count={2} tagsFile={tagsFile} {...handlers} />);
    await user.click(screen.getByRole("button", { name: /^clear$/i }));
    expect(handlers.onClear).toHaveBeenCalled();
  });
});
```

Run: `pnpm --filter @gitmarks/web test test/components.BulkActionsBar.test.tsx` — FAIL on missing module.

- [ ] **Step 2: Implement** — `packages/web/src/components/BulkActionsBar.tsx`:

```typescript
import { useState } from "react";
import type { TagsFile } from "@gitmarks/core";

interface Props {
  count: number;
  tagsFile: TagsFile;
  onAddTag: (tag: string) => Promise<void>;
  onRemoveTag: (tag: string) => Promise<void>;
  onSetFolder: (folder: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onClear: () => void;
}

const inputClass =
  "px-2 py-1 bg-mist border border-fog rounded text-cyan-soft text-sm focus:border-cyan focus:outline-none";
const btnClass =
  "px-3 py-1 rounded bg-fog text-cyan-soft text-sm hover:bg-cyan hover:text-ink disabled:opacity-40";
const dangerClass =
  "px-3 py-1 rounded border border-magenta text-magenta text-sm hover:bg-magenta hover:text-ink";

export function BulkActionsBar({ count, tagsFile, onAddTag, onRemoveTag, onSetFolder, onDelete, onClear }: Props) {
  const [tagToAdd, setTagToAdd] = useState("");
  const [tagToRemove, setTagToRemove] = useState("");
  const [folder, setFolder] = useState("");
  const tagOptions = Object.keys(tagsFile.tags).sort();

  return (
    <div className="border-b border-fog px-4 py-3 bg-mist flex flex-wrap items-center gap-3">
      <span className="text-cyan font-semibold">{count} selected</span>

      <div className="flex items-center gap-1">
        <input
          aria-label="add tag"
          className={inputClass}
          value={tagToAdd}
          onChange={(e) => setTagToAdd(e.target.value)}
          placeholder="tag"
        />
        <button
          type="button"
          className={btnClass}
          disabled={tagToAdd.length === 0}
          onClick={async () => {
            await onAddTag(tagToAdd);
            setTagToAdd("");
          }}
        >
          Add
        </button>
      </div>

      <div className="flex items-center gap-1">
        <select
          aria-label="remove tag"
          className={inputClass}
          value={tagToRemove}
          onChange={(e) => setTagToRemove(e.target.value)}
        >
          <option value="">(pick a tag)</option>
          {tagOptions.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <button
          type="button"
          className={btnClass}
          disabled={tagToRemove.length === 0}
          onClick={async () => {
            await onRemoveTag(tagToRemove);
            setTagToRemove("");
          }}
        >
          Remove
        </button>
      </div>

      <div className="flex items-center gap-1">
        <input
          aria-label="set folder"
          className={inputClass}
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
          placeholder="folder path"
        />
        <button
          type="button"
          className={btnClass}
          disabled={folder.length === 0}
          onClick={async () => {
            await onSetFolder(folder);
            setFolder("");
          }}
        >
          Set
        </button>
      </div>

      <button type="button" className={dangerClass} onClick={() => { void onDelete(); }}>
        Move to trash
      </button>

      <button type="button" className="ml-auto text-cyan-soft/60 text-sm hover:text-cyan" onClick={onClear}>
        Clear
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Verify**

```bash
pnpm --filter @gitmarks/web test test/components.BulkActionsBar.test.tsx
pnpm --filter @gitmarks/web typecheck
```

6 new tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/BulkActionsBar.tsx packages/web/test/components.BulkActionsBar.test.tsx
git commit -m "feat(web): bulk actions bar (add tag, remove tag, set folder, delete, clear)"
```

---

## Task 7: ListPage selection + BulkActionsBar integration

**Files:**
- Modify: `packages/web/src/routes/ListPage.tsx`
- Modify: `packages/web/test/ListPage.integration.test.tsx`

- [ ] **Step 1: Add failing integration tests**

In `packages/web/test/ListPage.integration.test.tsx`, append two more tests inside the existing `describe`:

```typescript
  it("shows the bulk actions bar after selecting a row", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ListPage client={fakeClient()} />
      </MemoryRouter>,
    );
    await screen.findByText("Hacker News");
    await user.click(screen.getByLabelText(/select hacker news/i));
    expect(screen.getByText(/1 selected/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /move to trash/i })).toBeInTheDocument();
  });

  it("calls client.update on bookmarks.json when Move to trash is clicked", async () => {
    const update = vi.fn().mockResolvedValue({ data: bookmarksFile, sha: "b2", etag: '"b2"' });
    const client = {
      read: vi.fn().mockImplementation(async (path: string) => {
        if (path === "bookmarks.json") return { data: bookmarksFile, sha: "b", etag: '"b"' };
        if (path === "tags.json") return { data: tagsFile, sha: "t", etag: '"t"' };
        throw new Error("unexpected");
      }),
      readIfChanged: vi.fn().mockResolvedValue(null),
      update,
    } as any;
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ListPage client={client} />
      </MemoryRouter>,
    );
    await screen.findByText("Hacker News");
    await user.click(screen.getByLabelText(/select hacker news/i));
    await user.click(screen.getByRole("button", { name: /move to trash/i }));
    expect(update).toHaveBeenCalledWith("bookmarks.json", expect.any(Function), expect.stringContaining("trash"));
  });
```

Run: `pnpm --filter @gitmarks/web test test/ListPage.integration.test.tsx` — should FAIL.

- [ ] **Step 2: Rewrite `ListPage.tsx`** to wire selection + BulkActionsBar:

```typescript
import { useMemo, useState } from "react";
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

interface Props {
  client: GitHubClient;
}

export function ListPage({ client }: Props) {
  const { bookmarksFile, tagsFile, loading, error, refresh, writeBookmarks } = useGitmarksData(client);
  const selection = useSelection();
  const [query, setQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
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

  function ids(): string[] {
    return [...selection.selected];
  }

  async function runBulk(message: string, mutator: (f: BookmarksFile) => BookmarksFile) {
    setWriteError(null);
    try {
      await writeBookmarks(mutator, message);
      selection.clear();
    } catch (err) {
      setWriteError(err instanceof Error ? err.message : String(err));
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
          {selection.selected.size > 0 && tagsFile != null && (
            <BulkActionsBar
              count={selection.selected.size}
              tagsFile={tagsFile}
              onAddTag={(tag) => runBulk(`bulk: add tag ${tag}`, bulkAddTag(ids(), tag, new Date().toISOString()))}
              onRemoveTag={(tag) => runBulk(`bulk: remove tag ${tag}`, bulkRemoveTag(ids(), tag, new Date().toISOString()))}
              onSetFolder={(folder) => runBulk(`bulk: set folder ${folder}`, bulkSetFolder(ids(), folder, new Date().toISOString()))}
              onDelete={() => runBulk(`bulk: move ${ids().length} to trash`, bulkSoftDelete(ids(), new Date().toISOString()))}
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
```

- [ ] **Step 3: Verify**

```bash
pnpm --filter @gitmarks/web test
pnpm --filter @gitmarks/web typecheck
```

Existing integration tests + 2 new tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/routes/ListPage.tsx packages/web/test/ListPage.integration.test.tsx
git commit -m "feat(web): list page bulk select + bulk actions wired to client.update"
```

---

## Task 8: TrashList component + TrashPage route

**Files:**
- Create: `packages/web/src/components/TrashList.tsx`
- Create: `packages/web/src/routes/TrashPage.tsx`
- Create: `packages/web/test/components.TrashList.test.tsx`
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/lib/data.ts`

- [ ] **Step 1: Add a `deletedBookmarks` helper to `packages/web/src/lib/data.ts`**

Append:

```typescript
export function deletedBookmarks(file: BookmarksFile, nowIso: string, gcDays = 30): Bookmark[] {
  const cutoffMs = new Date(nowIso).getTime() - gcDays * 86_400_000;
  return file.bookmarks.filter((b) => {
    if (b.deleted_at == null) return false;
    return new Date(b.deleted_at).getTime() > cutoffMs;
  });
}
```

Add a quick test in `packages/web/test/lib.data.test.ts` (append to the existing file):

```typescript
import { deletedBookmarks } from "../src/lib/data.js";

describe("deletedBookmarks", () => {
  const fileWithDeletes: BookmarksFile = {
    version: 1,
    updated_at: "2026-05-25T00:00:00Z",
    bookmarks: [
      mk({ id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CA", deleted_at: null }),
      mk({ id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CB", deleted_at: "2026-05-20T00:00:00Z" }),
      mk({ id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CC", deleted_at: "2026-03-01T00:00:00Z" }), // beyond 30d
    ],
  };

  it("returns deleted bookmarks within the GC window", () => {
    const got = deletedBookmarks(fileWithDeletes, "2026-05-25T00:00:00Z", 30);
    expect(got.map((b) => b.id)).toEqual(["01HXYZ8K7M9P3RQ2V5W6Z8B0CB"]);
  });

  it("returns empty when all deletes are past the GC window", () => {
    const got = deletedBookmarks(fileWithDeletes, "2027-01-01T00:00:00Z", 30);
    expect(got).toEqual([]);
  });
});
```

Run: `pnpm --filter @gitmarks/web test test/lib.data.test.ts`. Should FAIL on missing helper. Implement, watch pass.

- [ ] **Step 2: Write the failing `TrashList` test** — `packages/web/test/components.TrashList.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BookmarksFile, TagsFile } from "@gitmarks/core";
import { TrashList } from "../src/components/TrashList.js";

const tagsFile: TagsFile = { version: 1, tags: {} };

const bookmarksFile: BookmarksFile = {
  version: 1,
  updated_at: "2026-05-25T00:00:00Z",
  bookmarks: [
    {
      id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CA",
      url: "https://gone.example.com/",
      title: "Recently deleted",
      folder: "",
      tags: [],
      added_at: "2026-05-01T00:00:00Z",
      updated_at: "2026-05-20T00:00:00Z",
      added_from: "chrome@minerva",
      deleted_at: "2026-05-20T00:00:00Z",
      notes: null,
    },
    {
      id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CB",
      url: "https://alive.example.com/",
      title: "Still alive",
      folder: "",
      tags: [],
      added_at: "2026-05-01T00:00:00Z",
      updated_at: "2026-05-01T00:00:00Z",
      added_from: "chrome@minerva",
      deleted_at: null,
      notes: null,
    },
  ],
};

describe("TrashList", () => {
  it("renders only deleted bookmarks within the GC window", () => {
    render(
      <TrashList
        bookmarksFile={bookmarksFile}
        tagsFile={tagsFile}
        nowIso="2026-05-25T00:00:00Z"
        onRestore={vi.fn()}
      />,
    );
    expect(screen.getByText("Recently deleted")).toBeInTheDocument();
    expect(screen.queryByText("Still alive")).not.toBeInTheDocument();
  });

  it("calls onRestore with the bookmark id when its restore button is clicked", async () => {
    const onRestore = vi.fn();
    const user = userEvent.setup();
    render(
      <TrashList
        bookmarksFile={bookmarksFile}
        tagsFile={tagsFile}
        nowIso="2026-05-25T00:00:00Z"
        onRestore={onRestore}
      />,
    );
    await user.click(screen.getByRole("button", { name: /restore recently deleted/i }));
    expect(onRestore).toHaveBeenCalledWith("01HXYZ8K7M9P3RQ2V5W6Z8B0CA");
  });

  it("renders an empty state when no deletes are within the GC window", () => {
    const empty: BookmarksFile = { ...bookmarksFile, bookmarks: [bookmarksFile.bookmarks[1]!] };
    render(
      <TrashList
        bookmarksFile={empty}
        tagsFile={tagsFile}
        nowIso="2026-05-25T00:00:00Z"
        onRestore={vi.fn()}
      />,
    );
    expect(screen.getByText(/trash is empty/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Implement `TrashList.tsx`** — `packages/web/src/components/TrashList.tsx`:

```typescript
import type { BookmarksFile, TagsFile } from "@gitmarks/core";
import { TagChip } from "./TagChip.js";
import { deletedBookmarks } from "../lib/data.js";

interface Props {
  bookmarksFile: BookmarksFile;
  tagsFile: TagsFile;
  nowIso: string;
  onRestore: (id: string) => void | Promise<void>;
}

export function TrashList({ bookmarksFile, tagsFile, nowIso, onRestore }: Props) {
  const items = deletedBookmarks(bookmarksFile, nowIso);
  if (items.length === 0) {
    return <p className="p-6 text-cyan-soft/60">Trash is empty.</p>;
  }
  return (
    <ul className="divide-y divide-fog">
      {items.map((b) => (
        <li key={b.id} className="border-b border-fog px-4 py-3 flex items-baseline gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-cyan-soft truncate">{b.title}</div>
            <div className="text-xs text-cyan-soft/40 truncate">{b.url}</div>
            <div className="text-xs text-cyan-soft/60 mt-1">
              deleted {b.deleted_at} · folder {b.folder.length > 0 ? b.folder : "(root)"}
            </div>
            {b.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {b.tags.map((t) => <TagChip key={t} name={t} tagsFile={tagsFile} />)}
              </div>
            )}
          </div>
          <button
            type="button"
            aria-label={`restore ${b.title}`}
            className="px-3 py-1 rounded border border-fog text-cyan-soft hover:border-cyan text-sm"
            onClick={() => { void onRestore(b.id); }}
          >
            Restore
          </button>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Write `TrashPage.tsx`** — `packages/web/src/routes/TrashPage.tsx`:

```typescript
import { useState } from "react";
import type { BookmarksFile, GitHubClient } from "@gitmarks/core";
import { Layout, type LayoutStatus } from "../components/Layout.js";
import { TrashList } from "../components/TrashList.js";
import { useGitmarksData } from "../hooks/useGitmarksData.js";
import { bulkRestore } from "../lib/bulk-mutations.js";

interface Props {
  client: GitHubClient;
}

export function TrashPage({ client }: Props) {
  const { bookmarksFile, tagsFile, loading, error, refresh, writeBookmarks } = useGitmarksData(client);
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
    <Layout status={status} onRefresh={onRefresh} refreshing={refreshing}>
      <div data-testid="trash-page" className="p-4">
        <h1 className="text-magenta text-2xl mb-4">Trash</h1>
        <p className="text-cyan-soft/60 text-xs mb-4">
          Soft-deleted bookmarks within the 30-day GC window. After 30 days the
          extension's `gcTombstones` will remove them from <code>bookmarks.json</code>;
          git history retains everything.
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
```

- [ ] **Step 5: Wire `/trash` route in `App.tsx`**

Find the `createHashRouter([…])` block. Add a `TrashPageWithContext` wrapper alongside the existing `ListPageWithContext` and `TagsPageWithContext`, then add the route:

```typescript
import { TrashPage } from "./routes/TrashPage.js";

function TrashPageWithContext() {
  const { client } = useAppContext();
  return <TrashPage client={client} />;
}

// inside createHashRouter([...]):
{
  element: <RequireSettings />,
  children: [
    { path: "/", element: <ListPageWithContext /> },
    { path: "/tags", element: <TagsPageWithContext /> },
    { path: "/trash", element: <TrashPageWithContext /> },
  ],
},
```

- [ ] **Step 6: Verify**

```bash
pnpm --filter @gitmarks/web test
pnpm --filter @gitmarks/web typecheck
```

All previous + 5 new tests (3 TrashList + 2 data) pass.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/components/TrashList.tsx packages/web/src/routes/TrashPage.tsx packages/web/src/App.tsx packages/web/src/lib/data.ts packages/web/test/components.TrashList.test.tsx packages/web/test/lib.data.test.ts
git commit -m "feat(web): trash route with restore via bulkRestore"
```

---

## Task 9: Netscape HTML export utility

**Files:**
- Create: `packages/web/src/lib/netscape-export.ts`
- Create: `packages/web/test/lib.netscape-export.test.ts`

The Netscape Bookmark File Format is the lingua franca of bookmark export — Chrome / Firefox / Safari can all import it. Spec: https://msdn.microsoft.com/en-us/library/aa753582(v=vs.85).aspx (canonical Microsoft reference, still widely followed).

- [ ] **Step 1: Write the failing test** — `packages/web/test/lib.netscape-export.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import type { BookmarksFile } from "@gitmarks/core";
import { toNetscapeHtml } from "../src/lib/netscape-export.js";

const file: BookmarksFile = {
  version: 1,
  updated_at: "2026-05-25T00:00:00Z",
  bookmarks: [
    {
      id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CA",
      url: "https://news.ycombinator.com/",
      title: "Hacker News",
      folder: "",
      tags: ["daily"],
      added_at: "2026-05-01T08:00:00Z",
      updated_at: "2026-05-01T08:00:00Z",
      added_from: "chrome@minerva",
      deleted_at: null,
      notes: null,
    },
    {
      id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CB",
      url: "https://arxiv.org/abs/2310.00001",
      title: "Paper",
      folder: "Research/AI",
      tags: ["to-read"],
      added_at: "2026-05-02T09:00:00Z",
      updated_at: "2026-05-02T09:00:00Z",
      added_from: "firefox@minerva",
      deleted_at: null,
      notes: null,
    },
    {
      id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CC",
      url: "https://example.com/deleted",
      title: "Gone",
      folder: "",
      tags: [],
      added_at: "2026-04-01T00:00:00Z",
      updated_at: "2026-05-10T00:00:00Z",
      added_from: "chrome@minerva",
      deleted_at: "2026-05-10T00:00:00Z",
      notes: null,
    },
  ],
};

describe("toNetscapeHtml", () => {
  it("emits the canonical Netscape DOCTYPE", () => {
    const html = toNetscapeHtml(file);
    expect(html).toContain("<!DOCTYPE NETSCAPE-Bookmark-file-1>");
    expect(html).toContain("<TITLE>Bookmarks</TITLE>");
  });

  it("renders each non-deleted bookmark as <DT><A>", () => {
    const html = toNetscapeHtml(file);
    expect(html).toContain('<A HREF="https://news.ycombinator.com/"');
    expect(html).toContain(">Hacker News</A>");
    expect(html).toContain('<A HREF="https://arxiv.org/abs/2310.00001"');
  });

  it("skips tombstoned bookmarks", () => {
    const html = toNetscapeHtml(file);
    expect(html).not.toContain("https://example.com/deleted");
  });

  it("nests folder bookmarks under <H3> headings with <DL>", () => {
    const html = toNetscapeHtml(file);
    expect(html).toMatch(/<H3[^>]*>Research<\/H3>[\s\S]*<H3[^>]*>AI<\/H3>/);
  });

  it("escapes HTML-sensitive characters in titles and URLs", () => {
    const dangerous: BookmarksFile = {
      version: 1,
      updated_at: "2026-05-25T00:00:00Z",
      bookmarks: [
        {
          id: "01HXYZ8K7M9P3RQ2V5W6Z8B0CA",
          url: "https://example.com/?a=1&b=2",
          title: '<script>alert("x")</script>',
          folder: "",
          tags: [],
          added_at: "2026-05-01T00:00:00Z",
          updated_at: "2026-05-01T00:00:00Z",
          added_from: "chrome@minerva",
          deleted_at: null,
          notes: null,
        },
      ],
    };
    const html = toNetscapeHtml(dangerous);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
  });

  it("includes ADD_DATE attribute when added_at is parseable", () => {
    const html = toNetscapeHtml(file);
    const expectedEpoch = Math.floor(new Date("2026-05-01T08:00:00Z").getTime() / 1000);
    expect(html).toContain(`ADD_DATE="${expectedEpoch}"`);
  });

  it("emits TAGS attribute when bookmark has tags", () => {
    const html = toNetscapeHtml(file);
    expect(html).toContain('TAGS="daily"');
    expect(html).toContain('TAGS="to-read"');
  });
});
```

- [ ] **Step 2: Implement** — `packages/web/src/lib/netscape-export.ts`:

```typescript
import type { Bookmark, BookmarksFile } from "@gitmarks/core";

// Netscape Bookmark File Format reference:
// https://msdn.microsoft.com/en-us/library/aa753582(v=vs.85).aspx
// All major browsers import this format.

interface FolderNode {
  name: string;
  bookmarks: Bookmark[];
  children: Map<string, FolderNode>;
}

function emptyFolder(name: string): FolderNode {
  return { name, bookmarks: [], children: new Map() };
}

function buildTree(bookmarks: Bookmark[]): FolderNode {
  const root = emptyFolder("");
  for (const b of bookmarks) {
    if (b.folder.length === 0) {
      root.bookmarks.push(b);
      continue;
    }
    const segments = b.folder.split("/").filter((s) => s.length > 0);
    let cursor = root;
    for (const seg of segments) {
      let next = cursor.children.get(seg);
      if (next === undefined) {
        next = emptyFolder(seg);
        cursor.children.set(seg, next);
      }
      cursor = next;
    }
    cursor.bookmarks.push(b);
  }
  return root;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function epochSeconds(iso: string): number | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / 1000);
}

function renderBookmark(b: Bookmark, indent: string): string {
  const attrs: string[] = [`HREF="${escapeHtml(b.url)}"`];
  const added = epochSeconds(b.added_at);
  if (added !== null) attrs.push(`ADD_DATE="${added}"`);
  const updated = epochSeconds(b.updated_at);
  if (updated !== null) attrs.push(`LAST_MODIFIED="${updated}"`);
  if (b.tags.length > 0) attrs.push(`TAGS="${escapeHtml(b.tags.join(","))}"`);
  return `${indent}<DT><A ${attrs.join(" ")}>${escapeHtml(b.title)}</A>`;
}

function renderFolder(node: FolderNode, indent: string): string {
  const lines: string[] = [];
  if (node.name.length > 0) {
    lines.push(`${indent}<DT><H3>${escapeHtml(node.name)}</H3>`);
    lines.push(`${indent}<DL><p>`);
  }
  const inner = node.name.length > 0 ? `${indent}    ` : indent;
  for (const child of [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    lines.push(renderFolder(child, inner));
  }
  for (const b of node.bookmarks) {
    lines.push(renderBookmark(b, inner));
  }
  if (node.name.length > 0) {
    lines.push(`${indent}</DL><p>`);
  }
  return lines.join("\n");
}

export function toNetscapeHtml(file: BookmarksFile): string {
  const alive = file.bookmarks.filter((b) => b.deleted_at == null);
  const root = buildTree(alive);
  const body = renderFolder(root, "    ");
  return [
    "<!DOCTYPE NETSCAPE-Bookmark-file-1>",
    "<!-- Generated by gitmarks -->",
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    "<TITLE>Bookmarks</TITLE>",
    "<H1>Bookmarks</H1>",
    "<DL><p>",
    body,
    "</DL><p>",
    "",
  ].join("\n");
}
```

- [ ] **Step 3: Verify**

```bash
pnpm --filter @gitmarks/web test test/lib.netscape-export.test.ts
pnpm --filter @gitmarks/web typecheck
```

7 new tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/lib/netscape-export.ts packages/web/test/lib.netscape-export.test.ts
git commit -m "feat(web): Netscape HTML export utility (folder-aware, XSS-safe)"
```

---

## Task 10: Browser download helper + Export button in Layout

**Files:**
- Create: `packages/web/src/lib/download.ts`
- Modify: `packages/web/src/components/Layout.tsx`
- Modify: `packages/web/test/components.Layout.test.tsx`

- [ ] **Step 1: Write the download helper** — `packages/web/src/lib/download.ts`:

```typescript
// Triggers a browser file download for an in-memory string blob.
// Uses URL.createObjectURL + a synthetic anchor click, which is the standard
// approach that works across all evergreen browsers without polyfills.
export function downloadString(content: string, filename: string, mimeType = "text/html"): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after the click so the download completes; setTimeout(0) is enough
  // because the browser has already started the download by the next tick.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
```

- [ ] **Step 2: Modify the `Layout.tsx` props to add an `onExport` callback**

Update the `Props` interface and the header:

```typescript
interface Props {
  children: ReactNode;
  status: LayoutStatus;
  onRefresh: () => void;
  onExport?: () => void;
  refreshing: boolean;
}

export function Layout({ children, status, onRefresh, onExport, refreshing }: Props) {
  // existing JSX, but add Export button next to Sync button when onExport is provided:
  // <button type="button" onClick={onExport} className="...">Export</button>
}
```

In the existing header `div` with `className="ml-auto flex items-center gap-3 text-sm"`, add the Export button before the Sync button:

```typescript
{onExport && (
  <button
    type="button"
    onClick={onExport}
    className="px-3 py-1 rounded border border-fog text-cyan-soft hover:border-cyan"
  >
    Export
  </button>
)}
```

- [ ] **Step 3: Add a Layout test for the export button**

In `packages/web/test/components.Layout.test.tsx`, add:

```typescript
import { vi } from "vitest";

it("renders an Export button when onExport is provided and invokes it", async () => {
  const onExport = vi.fn();
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <Layout
        status={{ kind: "ok", message: "synced" }}
        onRefresh={() => {}}
        onExport={onExport}
        refreshing={false}
      >
        <div />
      </Layout>
    </MemoryRouter>,
  );
  await user.click(screen.getByRole("button", { name: /export/i }));
  expect(onExport).toHaveBeenCalled();
});
```

Add userEvent import if missing:
```typescript
import userEvent from "@testing-library/user-event";
```

- [ ] **Step 4: Verify**

```bash
pnpm --filter @gitmarks/web test
pnpm --filter @gitmarks/web typecheck
```

All previous + 1 new = pass.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/download.ts packages/web/src/components/Layout.tsx packages/web/test/components.Layout.test.tsx
git commit -m "feat(web): Layout Export button + Blob-download helper"
```

---

## Task 11: Wire Export in ListPage; add Trash nav link

**Files:**
- Modify: `packages/web/src/components/Layout.tsx`
- Modify: `packages/web/src/routes/ListPage.tsx`
- Modify: `packages/web/src/routes/TrashPage.tsx`
- Modify: `packages/web/src/routes/TagsPage.tsx`
- Modify: `packages/web/test/components.Layout.test.tsx`

- [ ] **Step 1: Add a Trash nav link in `Layout.tsx`**

In the `<nav>` block, after the Tags `NavLink`, add:

```typescript
<NavLink
  to="/trash"
  className={({ isActive }) =>
    `${navLinkBase} ${isActive ? navLinkActive : navLinkInactive}`
  }
>
  Trash
</NavLink>
```

Update the Layout test for the existing nav-links assertion to also check Trash:

```typescript
it("renders nav links for List, Tags, and Trash", () => {
  rendered();
  expect(screen.getByRole("link", { name: /list/i })).toHaveAttribute("href", "/");
  expect(screen.getByRole("link", { name: /tags/i })).toHaveAttribute("href", "/tags");
  expect(screen.getByRole("link", { name: /trash/i })).toHaveAttribute("href", "/trash");
});
```

(Replace the existing "renders nav links for List and Tags" test with this expanded version.)

- [ ] **Step 2: Wire `onExport` in ListPage**

In `packages/web/src/routes/ListPage.tsx`, import the helpers:

```typescript
import { toNetscapeHtml } from "../lib/netscape-export.js";
import { downloadString } from "../lib/download.js";
```

Inside the `ListPage` function body, add the handler:

```typescript
function onExport() {
  if (bookmarksFile == null) return;
  downloadString(toNetscapeHtml(bookmarksFile), "gitmarks.html", "text/html");
}
```

Pass `onExport` to `<Layout>`:

```typescript
<Layout status={status} onRefresh={onRefresh} onExport={onExport} refreshing={refreshing}>
```

Do the same in `TrashPage.tsx` and `TagsPage.tsx` — both pages should expose Export. Since both already use `Layout` and have access to `bookmarksFile` via the hook, the wiring is symmetric. For each page:

```typescript
function onExport() {
  if (bookmarksFile == null) return;
  downloadString(toNetscapeHtml(bookmarksFile), "gitmarks.html", "text/html");
}
// pass onExport to Layout
```

(For `TagsPage`, `bookmarksFile` isn't currently destructured from `useGitmarksData` — add it. The hook already loads both files; just include `bookmarksFile` in the destructure.)

- [ ] **Step 3: Verify**

```bash
pnpm --filter @gitmarks/web test
pnpm --filter @gitmarks/web typecheck
```

All tests pass. Layout has 4 tests now.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/Layout.tsx packages/web/src/routes/ListPage.tsx packages/web/src/routes/TrashPage.tsx packages/web/src/routes/TagsPage.tsx packages/web/test/components.Layout.test.tsx
git commit -m "feat(web): Trash nav link and wire Netscape export from every page"
```

---

## Task 12: TrashPage routing test

**Files:**
- Modify: `packages/web/test/App.routing.test.tsx`

- [ ] **Step 1: Add a trash route test**

Append to the existing `describe("App routing", …)`:

```typescript
  it("renders the trash page at /trash", async () => {
    saveSettings(validSettings);
    render(<AppRoutes initialPath="/trash" />);
    expect(await screen.findByTestId("trash-page")).toBeInTheDocument();
  });
```

The existing `AppRoutes` helper composes the routes via `MemoryRouter + Routes/Route`. Add the new route there:

```typescript
<Route path="/trash" element={<div data-testid="trash-page">trash</div>} />
```

(Routing tests use placeholders, not the real `TrashPage`, to keep them focused on redirect semantics — same pattern as v1.)

- [ ] **Step 2: Verify + Commit**

```bash
pnpm --filter @gitmarks/web test
```

All previous + 1 new = pass.

```bash
git add packages/web/test/App.routing.test.tsx
git commit -m "test(web): cover /trash route under RequireSettings"
```

---

## Task 13: Docs + roadmap update

**Files:**
- Modify: `packages/web/README.md`
- Modify: `README.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Extend `packages/web/README.md`**

In the "Hash routes" section, add the new route:

```markdown
- `#/trash` — soft-deleted bookmarks within the 30-day GC window, with restore
```

Append to the "Manual smoke test" checklist:

```markdown
- [ ] Select multiple rows via their checkboxes → the BulkActionsBar appears with
      the count + add-tag/remove-tag/set-folder/move-to-trash/clear actions.
- [ ] Add a tag via the bar → all selected rows show the new tag. One commit
      lands on `bookmarks.json`.
- [ ] Move several rows to trash → they disappear from the list, the BulkActionsBar
      clears, and the entries get `deleted_at` set on GitHub.
- [ ] Open `#/trash` → the moved rows are listed. Click **Restore** on one →
      it disappears from trash and reappears in the list. One commit lands.
- [ ] Click **Export** in the header → a file `gitmarks.html` downloads. Open
      it in another browser's bookmark-import → the bookmarks appear, folders
      nested correctly. Tombstones are not exported.
```

Update the "Scope (v1)" section so it now reads "Scope (v1 + v2)":

```markdown
## Scope (v1 + v2)

Read + write side. Bookmark creation still happens via the extension (per
spec); the web UI does NOT create bookmarks.

Web UI scope, today:
- List + search + tag filter
- Tag manager (rename / recolor / add / delete)
- Multi-select + bulk operations (add tag, remove tag, set folder, move to trash)
- Trash view with restore
- Netscape HTML export
```

Remove the link to issue #25 since it's now done.

- [ ] **Step 2: Update root `README.md`**

In the "Roadmap" section, change:

```
- ⬜ Web UI v2: bulk operations + trash + export ([#25](https://github.com/paperhurts/gitmarks/issues/25))
```

to:

```
- ✅ Web UI v2: bulk operations + trash + export ([#25](https://github.com/paperhurts/gitmarks/issues/25))
```

Update the test count line. Get the new total via `pnpm test` and write the result:

```
- N automated unit + component tests + 6 Playwright e2e (against real Chromium)
```

(Replace `N` with the actual count after running `pnpm test`.)

- [ ] **Step 3: Update `CLAUDE.md`**

In the `@gitmarks/web` subsection, extend the bullet list with the v2 additions:

```markdown
- **Bulk operations** (`src/lib/bulk-mutations.ts`, `src/components/BulkActionsBar.tsx`): multi-select state via `useSelection`; bulk add tag / remove tag / set folder / soft-delete; each fires one `client.update` call per action.
- **Trash** (`src/routes/TrashPage.tsx`, `src/components/TrashList.tsx`): filters `deleted_at != null` within the 30-day GC window; restore clears `deleted_at`.
- **Export** (`src/lib/netscape-export.ts`, `src/lib/download.ts`): generates Netscape Bookmark File Format and triggers a browser download via Blob.
```

Update the test count in "Project status":

```
- `@gitmarks/web` (`packages/web/`) — Vite + React + Tailwind SPA. List, search, tag management, bulk operations, trash, Netscape HTML export. Talks directly to GitHub via `@gitmarks/core`. Hash routing (`#/setup`, `#/`, `#/tags`, `#/trash`). N unit + component tests.
```

(Run `pnpm --filter @gitmarks/web test` to get the actual count and replace `N`.)

In the Roadmap section, check off v2:

```
6. ✅ Web UI v2: bulk operations + trash + export — issue [#25](https://github.com/paperhurts/gitmarks/issues/25)
```

Update the "Pending packages" line to drop v2:

```
Pending packages (in dependency order): Safari.
```

Update the "Total" line in Project status with the new total test count.

- [ ] **Step 4: Verify the full pipeline**

```bash
pnpm install
pnpm --filter @gitmarks/core build
pnpm typecheck
pnpm test
pnpm build
```

All green.

- [ ] **Step 5: Commit**

```bash
git add packages/web/README.md README.md CLAUDE.md
git commit -m "docs(web): document bulk operations, trash, and export (v2)"
```

---

## Final Verification

- [ ] **Run the full test suite from repo root**

```bash
pnpm test
pnpm typecheck
pnpm build
```

All green across the monorepo.

- [ ] **Manual smoke test** — start the dev server and walk the `packages/web/README.md` smoke-test checklist using a real bookmarks repo. Confirm bulk actions commit one entry to git history per action, the trash view filters correctly, and the export file imports cleanly into another browser.

- [ ] **Open the PR** — per `superpowers:finishing-a-development-branch`:

```bash
git push -u origin feat/web-ui-v2
gh pr create --title "feat(web): web UI v2 — bulk ops, trash, export" --body "$(cat <<'EOF'
## Summary
- Multi-select on the list page + BulkActionsBar (add tag, remove tag, set folder, move to trash, clear).
- `/trash` route with single + bulk restore.
- Netscape HTML export from every page.
- Two new pure helpers in `@gitmarks/core`: `updateBookmarks` (bulk) and `restoreBookmark`.

Closes #25.

## Test plan
- [x] Unit + component suite green (Vitest + @testing-library/react)
- [x] Full monorepo typecheck + build clean
- [ ] Manual smoke test (see `packages/web/README.md`)
- [ ] Exported `gitmarks.html` imports cleanly into Chrome / Firefox

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Wait for CI green, then merge with a merge commit.

---

## Spec Cross-Reference

| Spec / issue requirement | Task |
|---|---|
| Bulk select + tag/move/delete | Tasks 3, 5, 6, 7 |
| Bulk apply → single batched `client.update()` | Tasks 4, 7 (each bulk action emits one mutator → one update call) |
| Trash listing filters `deleted_at != null` | Tasks 8, 9 (filter, route) |
| Restore action clears `deleted_at` | Tasks 1 (core helper), 8 (UI) |
| Netscape HTML export | Tasks 9, 10, 11 |
| Soft deletes only (no permanent delete) | Honored — no permanent-delete path anywhere |
| No bookmark creation in web UI | Honored — no creation surface |
| Conflict handling via `client.update`'s replay | Bulk mutators are pure (close over args, not state) so replay is safe |

## Notes for the implementer

- The mutator returned by every `bulk*` factory captures the ids + args. The mutator is then passed to `client.update`, which may replay it on a 409. Because the mutator only does `file → updateBookmarks(file, patches, nowIso)` against whatever fresh file the client just refetched, the replay produces the same intent against the latest data — which is exactly what we want.
- The `nowIso` argument captured at action time gets reused on replay. That's intentional: we want the `updated_at` timestamp to reflect the user's intent moment, not a retry moment.
- Don't add a permanent-delete-from-trash button. The extension's `gcTombstones` is the canonical removal path; surfacing it in the web UI would create two ways to do the same thing.
- After every bulk action commits, `selection.clear()` is called — this prevents stale ids from sitting in the selection across renders.
