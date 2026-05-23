const KEY = "gitmarks:idMap";

export interface IdMap {
  ulidToNode: Map<string, string>;
  nodeToUlid: Map<string, string>;
}

export async function loadIdMap(): Promise<IdMap> {
  const stored = await chrome.storage.local.get(KEY);
  const raw = stored[KEY];
  const map: IdMap = { ulidToNode: new Map(), nodeToUlid: new Map() };
  if (raw == null || typeof raw !== "object") return map;
  const obj = raw as { entries?: Array<[string, string]> };
  if (!Array.isArray(obj.entries)) return map;
  for (const [ulid, nodeId] of obj.entries) {
    if (typeof ulid !== "string" || typeof nodeId !== "string") continue;
    map.ulidToNode.set(ulid, nodeId);
    map.nodeToUlid.set(nodeId, ulid);
  }
  return map;
}

export async function saveIdMap(map: IdMap): Promise<void> {
  const entries = Array.from(map.ulidToNode.entries());
  await chrome.storage.local.set({ [KEY]: { entries } });
}

export function setMapping(map: IdMap, ulid: string, nodeId: string): void {
  const prevNode = map.ulidToNode.get(ulid);
  if (prevNode != null) map.nodeToUlid.delete(prevNode);
  const prevUlid = map.nodeToUlid.get(nodeId);
  if (prevUlid != null) map.ulidToNode.delete(prevUlid);
  map.ulidToNode.set(ulid, nodeId);
  map.nodeToUlid.set(nodeId, ulid);
}

export function removeUlidMapping(map: IdMap, ulid: string): void {
  const nodeId = map.ulidToNode.get(ulid);
  map.ulidToNode.delete(ulid);
  if (nodeId != null) map.nodeToUlid.delete(nodeId);
}

export function removeNodeMapping(map: IdMap, nodeId: string): void {
  const ulid = map.nodeToUlid.get(nodeId);
  map.nodeToUlid.delete(nodeId);
  if (ulid != null) map.ulidToNode.delete(ulid);
}

export function ulidForNode(map: IdMap, nodeId: string): string | undefined {
  return map.nodeToUlid.get(nodeId);
}

export function nodeForUlid(map: IdMap, ulid: string): string | undefined {
  return map.ulidToNode.get(ulid);
}
