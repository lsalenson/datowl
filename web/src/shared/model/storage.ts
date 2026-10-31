// Per-window UI conveniences (open tabs, page size). Storage can be unavailable or
// cleared at any time, so every access falls back silently.

export function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function saveJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore: losing a UI preference is harmless.
  }
}
