import { vi, beforeEach } from "vitest";

interface StorageBackend {
  data: Record<string, unknown>;
}

const backend: StorageBackend = { data: {} };

const chromeStub = {
  storage: {
    local: {
      get: vi.fn(async (keys?: string | string[] | null) => {
        if (keys == null) return { ...backend.data };
        const list = Array.isArray(keys) ? keys : [keys];
        const out: Record<string, unknown> = {};
        for (const k of list) {
          if (k in backend.data) out[k] = backend.data[k];
        }
        return out;
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(backend.data, items);
      }),
      remove: vi.fn(async (keys: string | string[]) => {
        const list = Array.isArray(keys) ? keys : [keys];
        for (const k of list) delete backend.data[k];
      }),
      clear: vi.fn(async () => {
        for (const k of Object.keys(backend.data)) delete backend.data[k];
      }),
    },
  },
  runtime: {
    openOptionsPage: vi.fn(),
    sendMessage: vi.fn(),
    onMessage: { addListener: vi.fn() },
    lastError: undefined as chrome.runtime.LastError | undefined,
  },
  bookmarks: {
    create: vi.fn(async (props: chrome.bookmarks.BookmarkCreateArg) => {
      return { id: `mock-${Math.random().toString(36).slice(2, 10)}`, ...props } as chrome.bookmarks.BookmarkTreeNode;
    }),
    update: vi.fn(async () => ({} as chrome.bookmarks.BookmarkTreeNode)),
    move: vi.fn(async () => ({} as chrome.bookmarks.BookmarkTreeNode)),
    remove: vi.fn(async () => {}),
    get: vi.fn(async () => [] as chrome.bookmarks.BookmarkTreeNode[]),
    getTree: vi.fn(async () => [] as chrome.bookmarks.BookmarkTreeNode[]),
    getSubTree: vi.fn(async () => [] as chrome.bookmarks.BookmarkTreeNode[]),
    onCreated: { addListener: vi.fn(), removeListener: vi.fn() },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    onMoved: { addListener: vi.fn(), removeListener: vi.fn() },
    onRemoved: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  alarms: {
    create: vi.fn(),
    clear: vi.fn(),
    onAlarm: { addListener: vi.fn() },
  },
  tabs: {
    query: vi.fn(),
  },
};

vi.stubGlobal("chrome", chromeStub);

beforeEach(async () => {
  await chromeStub.storage.local.clear();
  vi.clearAllMocks();
});

export { chromeStub };
