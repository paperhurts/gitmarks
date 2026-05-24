// 2s = 4× the 500ms listener debounce; long enough to swallow our own echo from
// apply-remote.create→onCreated, short enough that a fresh user edit on the
// same URL is still pushed.
const SUPPRESSION_TTL_MS = 2000;

// URL-keyed suppression catches echoes from chrome.bookmarks.create and
// chrome.bookmarks.remove (the resulting onCreated / onRemoved events carry
// the affected URL in their payload).
const urlRegistry = new Map<string, number>();

// NodeId-keyed suppression catches title-only echoes from
// chrome.bookmarks.update({title}): Chrome's onChanged carries only the
// changed fields, so a title-only update yields changeInfo.url === undefined
// and URL-suppression can't see it. We track the node id separately.
const nodeRegistry = new Map<string, number>();

export function suppress(url: string): void {
  urlRegistry.set(url, Date.now() + SUPPRESSION_TTL_MS);
}

export function isSuppressed(url: string): boolean {
  return checkAndClean(urlRegistry, url);
}

export function suppressNode(nodeId: string): void {
  nodeRegistry.set(nodeId, Date.now() + SUPPRESSION_TTL_MS);
}

export function isNodeSuppressed(nodeId: string): boolean {
  return checkAndClean(nodeRegistry, nodeId);
}

export function clearSuppression(): void {
  urlRegistry.clear();
  nodeRegistry.clear();
}

function checkAndClean(registry: Map<string, number>, key: string): boolean {
  const expiresAt = registry.get(key);
  if (expiresAt == null) return false;
  if (Date.now() >= expiresAt) {
    registry.delete(key);
    return false;
  }
  return true;
}
