// Schemas + inferred types
export {
  bookmarkSchema,
  bookmarksFileSchema,
  type Bookmark,
  type BookmarksFile,
} from "./schema/bookmarks.js";
export {
  tagSchema,
  tagsFileSchema,
  type Tag,
  type TagsFile,
} from "./schema/tags.js";

// Primitives
export { newUlid } from "./ulid.js";
export { normalizeUrl } from "./url.js";

// Pure mutations
export {
  addBookmark,
  updateBookmark,
  softDeleteBookmark,
  gcTombstones,
} from "./mutate.js";

// GitHub client
export {
  GitHubClient,
  type GitHubClientOptions,
  type ReadResult,
} from "./github/client.js";
export {
  GitHubError,
  GitHubAuthError,
  GitHubConflictError,
  GitHubNotFoundError,
} from "./github/errors.js";
