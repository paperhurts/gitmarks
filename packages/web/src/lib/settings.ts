import { z } from "zod";

const STORAGE_KEY = "gitmarks:web:settings";

export const settingsSchema = z.object({
  token: z.string().min(1),
  owner: z.string().min(1),
  repo: z.string().min(1),
  branch: z.string().min(1),
});

export type Settings = z.infer<typeof settingsSchema>;

export function loadSettings(): Settings | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw == null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = settingsSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

export function saveSettings(settings: Settings): void {
  const validated = settingsSchema.parse(settings);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(validated));
}

export function clearSettings(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// ── Running inside the browser extension ────────────────────────────────────
// Each extension ships this same build at `web/index.html`. Opened from there,
// the page shares the extension's origin, so it reads the settings the user
// already entered in the extension instead of asking for the PAT again.

/** Key the extension stores its settings under (extension-shared/src/lib/settings.ts). */
export const EXTENSION_SETTINGS_KEY = "gitmarks:settings";

const EXTENSION_PROTOCOL = /^(chrome|moz|safari-web)-extension:$/;

interface ExtensionStorageArea {
  get(key: string): Promise<Record<string, unknown>>;
}
interface ExtensionApi {
  storage?: { local?: ExtensionStorageArea };
  runtime?: { openOptionsPage?: () => unknown };
}

/** Injectable for tests; defaults to the real page environment. */
export interface PageEnv {
  protocol: string;
  api: ExtensionApi | undefined;
}

function defaultEnv(): PageEnv {
  const g = globalThis as { browser?: ExtensionApi; chrome?: ExtensionApi };
  return {
    protocol: globalThis.location?.protocol ?? "",
    // Firefox/Safari expose the promise-based `browser`; Chrome MV3's
    // `chrome.storage` also returns promises.
    api: g.browser?.storage?.local != null ? g.browser : g.chrome,
  };
}

/** True when this page is the copy bundled in the extension (not the public site). */
export function isExtensionPage(env: PageEnv = defaultEnv()): boolean {
  return EXTENSION_PROTOCOL.test(env.protocol) && env.api?.storage?.local != null;
}

/**
 * Read the extension's own settings. The extension's schema is stricter and has
 * extra fields (e.g. stripTrackingParams); Zod drops the extras. Malformed or
 * missing settings return null, the same as the localStorage path.
 */
export async function loadExtensionSettings(env: PageEnv = defaultEnv()): Promise<Settings | null> {
  if (!isExtensionPage(env)) return null;
  const got = await env.api!.storage!.local!.get(EXTENSION_SETTINGS_KEY);
  const result = settingsSchema.safeParse(got[EXTENSION_SETTINGS_KEY]);
  return result.success ? result.data : null;
}

/** Open the extension's options page (where setup happens). */
export function openExtensionOptions(env: PageEnv = defaultEnv()): void {
  void env.api?.runtime?.openOptionsPage?.();
}
