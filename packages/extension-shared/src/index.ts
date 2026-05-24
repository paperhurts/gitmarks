// Re-exports the public surface that browser-specific shells consume.
// Kept alphabetized; add new lib/ surfaces here as they appear.

export { applyRemoteChanges } from "./lib/apply-remote.js";
export * from "./lib/background-core.js";
export { buildBookmark, type BuildBookmarkInput } from "./lib/bookmark-factory.js";
export {
  BOOKMARKS_PATH,
  emptyBookmarksFile,
  updateBookmarksOrBootstrap,
} from "./lib/bookmarks-file.js";
export {
  BOOKMARKS_BAR_FOLDER,
  OTHER_BOOKMARKS_FOLDER,
  folderPathFromNode,
  splitFolderPath,
  type SplitPath,
  type TreeNode,
} from "./lib/folder-path.js";
export {
  IdMap,
  asNodeId,
  asUlid,
  type NodeId,
  type Ulid,
} from "./lib/id-mapping.js";
export {
  flushPending,
  registerListeners,
  __resetForTest,
  type ListenerDeps,
} from "./lib/listeners.js";
export { getMachineId } from "./lib/machine-id.js";
export { reconcile } from "./lib/reconcile.js";
export {
  saveBookmark,
  type PageInfo,
  type SaveOptions,
  type SaveResult,
} from "./lib/save-flow.js";
export {
  SettingsCorruptError,
  clearSettings,
  loadSettings,
  saveSettings,
  settingsSchema,
  type Settings,
} from "./lib/settings.js";
export {
  clearSuppression,
  isNodeSuppressed,
  isSuppressed,
  suppress,
  suppressNode,
} from "./lib/suppression.js";
