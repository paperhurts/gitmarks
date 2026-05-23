const SUPPRESSION_TTL_MS = 2000;

const registry = new Map<string, number>();

export function suppress(url: string): void {
  registry.set(url, Date.now() + SUPPRESSION_TTL_MS);
}

export function isSuppressed(url: string): boolean {
  const expiresAt = registry.get(url);
  if (expiresAt == null) return false;
  if (Date.now() >= expiresAt) {
    registry.delete(url);
    return false;
  }
  return true;
}

export function clearSuppression(): void {
  registry.clear();
}
