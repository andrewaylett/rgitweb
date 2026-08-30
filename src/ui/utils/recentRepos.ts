const STORAGE_KEY = "rgitweb:recent-repos";
const MAX_ENTRIES = 10;

export interface RecentRepo {
  readonly url: string;
  readonly visitedAt: number;
}

export function loadRecentRepos(): readonly RecentRepo[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (entry): entry is RecentRepo =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as RecentRepo).url === "string" &&
        typeof (entry as RecentRepo).visitedAt === "number",
    );
  } catch {
    return [];
  }
}

export function addRecentRepo(url: string): void {
  try {
    const existing = loadRecentRepos().filter((entry) => entry.url !== url);
    const updated = [{ url, visitedAt: Date.now() }, ...existing].slice(
      0,
      MAX_ENTRIES,
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // localStorage may be unavailable (private browsing, quota); recents are
    // a convenience, not a requirement.
  }
}

export function removeRecentRepo(url: string): void {
  try {
    const updated = loadRecentRepos().filter((entry) => entry.url !== url);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Ignore, as above.
  }
}
