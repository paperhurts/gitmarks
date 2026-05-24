import browser from "webextension-polyfill";

// Branded string types — nominal phantom types that prevent argument-swap bugs.
declare const ulidBrand: unique symbol;
declare const nodeIdBrand: unique symbol;

export type Ulid = string & { readonly [ulidBrand]: true };
export type NodeId = string & { readonly [nodeIdBrand]: true };

// Brand constructors. These are unchecked casts — the runtime contract is that
// callers supply already-validated strings (ULID from @gitmarks/core, nodeId
// from chrome.bookmarks). At the boundaries that produce these strings we
// trust them.
export function asUlid(s: string): Ulid {
  return s as Ulid;
}
export function asNodeId(s: string): NodeId {
  return s as NodeId;
}

const KEY = "gitmarks:idMap";

/**
 * Bidirectional ULID ↔ chromeNodeId map persisted in chrome.storage.local.
 *
 * Invariant: for every (ulid → nodeId) in one direction there is a
 * (nodeId → ulid) in the other, and both maps have the same size. This is
 * enforced by the private fields + the small set of mutator methods below;
 * external code cannot construct an asymmetric state.
 */
export class IdMap {
  readonly #ulidToNode = new Map<Ulid, NodeId>();
  readonly #nodeToUlid = new Map<NodeId, Ulid>();

  static empty(): IdMap {
    return new IdMap();
  }

  static async load(): Promise<IdMap> {
    const stored = await browser.storage.local.get(KEY);
    const raw = stored[KEY];
    const map = new IdMap();
    if (raw == null || typeof raw !== "object") return map;
    const obj = raw as { entries?: Array<[string, string]> };
    if (!Array.isArray(obj.entries)) return map;
    for (const [ulid, nodeId] of obj.entries) {
      if (typeof ulid !== "string" || typeof nodeId !== "string") continue;
      map.set(asUlid(ulid), asNodeId(nodeId));
    }
    return map;
  }

  async save(): Promise<void> {
    const entries = Array.from(this.#ulidToNode.entries());
    await browser.storage.local.set({ [KEY]: { entries } });
  }

  /**
   * Bind a ulid to a nodeId. If either side already had a binding to a
   * different counterpart, those bindings are cleared first so the
   * invariant is preserved.
   */
  set(ulid: Ulid, nodeId: NodeId): void {
    const prevNode = this.#ulidToNode.get(ulid);
    if (prevNode != null) this.#nodeToUlid.delete(prevNode);
    const prevUlid = this.#nodeToUlid.get(nodeId);
    if (prevUlid != null) this.#ulidToNode.delete(prevUlid);
    this.#ulidToNode.set(ulid, nodeId);
    this.#nodeToUlid.set(nodeId, ulid);
  }

  removeByUlid(ulid: Ulid): void {
    const nodeId = this.#ulidToNode.get(ulid);
    this.#ulidToNode.delete(ulid);
    if (nodeId != null) this.#nodeToUlid.delete(nodeId);
  }

  removeByNode(nodeId: NodeId): void {
    const ulid = this.#nodeToUlid.get(nodeId);
    this.#nodeToUlid.delete(nodeId);
    if (ulid != null) this.#ulidToNode.delete(ulid);
  }

  ulidForNode(nodeId: NodeId): Ulid | undefined {
    return this.#nodeToUlid.get(nodeId);
  }

  nodeForUlid(ulid: Ulid): NodeId | undefined {
    return this.#ulidToNode.get(ulid);
  }

  get size(): number {
    return this.#ulidToNode.size;
  }
}
