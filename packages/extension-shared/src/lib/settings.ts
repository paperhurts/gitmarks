import browser from "webextension-polyfill";
import { z } from "zod";

export const SETTINGS_KEY = "gitmarks:settings";

export const settingsSchema = z.object({
  token: z.string().min(1, "token required"),
  owner: z.string().regex(/^[A-Za-z0-9_.-]+$/, "owner must be a single GitHub login"),
  repo: z.string().regex(/^[A-Za-z0-9_.-]+$/, "repo must be a single GitHub repo name"),
  branch: z.string().min(1),
  stripTrackingParams: z.boolean().default(false),
});

export type Settings = z.infer<typeof settingsSchema>;

export class SettingsCorruptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettingsCorruptError";
  }
}

export async function loadSettings(): Promise<Settings | null> {
  const result = await browser.storage.local.get(SETTINGS_KEY);
  const raw = result[SETTINGS_KEY];
  if (raw == null) return null;
  const parsed = settingsSchema.safeParse(raw);
  if (!parsed.success) {
    console.error("[gitmarks] stored settings failed validation", {
      issues: parsed.error.issues,
    });
    throw new SettingsCorruptError(
      "Stored settings are invalid — please reconfigure.",
    );
  }
  return parsed.data;
}

export async function saveSettings(value: Settings): Promise<void> {
  const validated = settingsSchema.parse(value);
  await browser.storage.local.set({ [SETTINGS_KEY]: validated });
}

export async function clearSettings(): Promise<void> {
  await browser.storage.local.remove(SETTINGS_KEY);
}
