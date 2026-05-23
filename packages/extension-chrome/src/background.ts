import {
  GitHubClient,
  GitHubNotFoundError,
  GitHubAuthError,
  type BookmarksFile,
} from "@gitmarks/core";
import { loadSettings, type Settings } from "./lib/settings.js";
import { getMachineId } from "./lib/machine-id.js";
import { IdMap } from "./lib/id-mapping.js";
import { reconcile } from "./lib/reconcile.js";
import { registerListeners } from "./lib/listeners.js";
import { applyRemoteChanges } from "./lib/apply-remote.js";

const RECONCILE_INTERVAL_MS = 60 * 60 * 1000;
const POLL_ALARM_NAME = "gitmarks:poll";
const RECONCILED_AT_KEY = "gitmarks:lastReconciledAt";
const LAST_ETAG_KEY = "gitmarks:bookmarksEtag";

let cachedBarId: string | null = null;
let cachedOtherId: string | null = null;

async function getBarOtherIds(): Promise<{ bar: string; other: string }> {
  if (cachedBarId != null && cachedOtherId != null) {
    return { bar: cachedBarId, other: cachedOtherId };
  }
  const tree = await chrome.bookmarks.getTree();
  const root = tree[0];
  if (root?.children == null) {
    throw new Error("unexpected chrome.bookmarks tree shape");
  }
  let bar: string | null = null;
  let other: string | null = null;
  for (const child of root.children) {
    if (child.id === "1") bar = child.id;
    else if (child.id === "2") other = child.id;
  }
  if (bar == null || other == null) {
    throw new Error("could not find Bookmarks Bar (id=1) or Other Bookmarks (id=2) in tree");
  }
  cachedBarId = bar;
  cachedOtherId = other;
  return { bar, other };
}

function buildClient(settings: Settings): GitHubClient {
  return new GitHubClient({
    owner: settings.owner,
    repo: settings.repo,
    token: settings.token,
    branch: settings.branch,
  });
}

async function maybeReconcile(): Promise<void> {
  const settings = await loadSettings();
  if (settings == null) return;

  const stored = await chrome.storage.local.get(RECONCILED_AT_KEY);
  const last = typeof stored[RECONCILED_AT_KEY] === "number"
    ? (stored[RECONCILED_AT_KEY] as number)
    : 0;
  if (Date.now() - last < RECONCILE_INTERVAL_MS) return;

  const { bar, other } = await getBarOtherIds();
  const client = buildClient(settings);
  const idMap = await IdMap.load();
  const machineId = await getMachineId();
  const nowIso = new Date().toISOString();

  try {
    await reconcile(client, idMap, bar, other, machineId, nowIso);
    await chrome.storage.local.set({ [RECONCILED_AT_KEY]: Date.now() });
    await chrome.storage.local.remove("gitmarks:lastError");
  } catch (err) {
    console.error("[gitmarks] reconcile failed", err);
    await chrome.storage.local.set({
      "gitmarks:lastError": {
        when: Date.now(),
        message: err instanceof Error ? err.message : String(err),
        source: "reconcile",
        kind: err instanceof GitHubAuthError ? "auth" : "unknown",
      },
    });
  }
}

async function pollRemoteOnce(): Promise<void> {
  const settings = await loadSettings();
  if (settings == null) return;
  const client = buildClient(settings);
  const stored = await chrome.storage.local.get(LAST_ETAG_KEY);
  const etag = typeof stored[LAST_ETAG_KEY] === "string"
    ? (stored[LAST_ETAG_KEY] as string)
    : null;

  try {
    const result = etag
      ? await client.readIfChanged<BookmarksFile>("bookmarks.json", etag)
      : await client.read<BookmarksFile>("bookmarks.json");
    if (result == null) return;
    const { bar, other } = await getBarOtherIds();
    const idMap = await IdMap.load();
    await applyRemoteChanges(result.data, idMap, bar, other);
    await chrome.storage.local.set({ [LAST_ETAG_KEY]: result.etag });
    await chrome.storage.local.remove("gitmarks:lastError");
  } catch (err) {
    if (err instanceof GitHubNotFoundError) return;
    console.error("[gitmarks] poll failed", err);
    await chrome.storage.local.set({
      "gitmarks:lastError": {
        when: Date.now(),
        message: err instanceof Error ? err.message : String(err),
        source: "poll",
        kind: err instanceof GitHubAuthError ? "auth" : "unknown",
      },
    });
  }
}

registerListeners({
  getClient: async () => {
    const s = await loadSettings();
    if (s == null) throw new Error("no settings");
    return buildClient(s);
  },
  getIdMap: async () => IdMap.load(),
  getBarOtherIds,
  getMachineId,
});

chrome.alarms.create(POLL_ALARM_NAME, { periodInMinutes: 5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === POLL_ALARM_NAME) {
    void pollRemoteOnce();
  }
});

void maybeReconcile();
