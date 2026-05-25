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
