import { z } from "zod";

const SETTINGS_KEY = "gitmarks:settings";

export const settingsSchema = z.object({
  token: z.string().min(1, "token required"),
  owner: z.string().regex(/^[A-Za-z0-9_.-]+$/, "owner must be a single GitHub login"),
  repo: z.string().regex(/^[A-Za-z0-9_.-]+$/, "repo must be a single GitHub repo name"),
  branch: z.string().min(1),
});

export type Settings = z.infer<typeof settingsSchema>;

export async function loadSettings(): Promise<Settings | null> {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  const raw = result[SETTINGS_KEY];
  if (raw == null) return null;
  const parsed = settingsSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export async function saveSettings(value: Settings): Promise<void> {
  const validated = settingsSchema.parse(value);
  await chrome.storage.local.set({ [SETTINGS_KEY]: validated });
}

export async function clearSettings(): Promise<void> {
  await chrome.storage.local.remove(SETTINGS_KEY);
}
