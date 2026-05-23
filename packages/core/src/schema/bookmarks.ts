import { z } from "zod";

const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export const bookmarkSchema = z.object({
  id: z.string().regex(ULID_REGEX, "id must be a ULID"),
  url: z.string().url(),
  title: z.string(),
  folder: z.string(),
  tags: z.array(z.string()),
  added_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
  added_from: z.string().regex(/^[^@]+@[^@]+$/, "must be <browser>@<machine>"),
  deleted_at: z.string().datetime({ offset: true }).nullable(),
  notes: z.string().nullable(),
});

export const bookmarksFileSchema = z.object({
  version: z.literal(1),
  updated_at: z.string().datetime({ offset: true }),
  bookmarks: z.array(bookmarkSchema),
});

export type Bookmark = z.infer<typeof bookmarkSchema>;
export type BookmarksFile = z.infer<typeof bookmarksFileSchema>;
