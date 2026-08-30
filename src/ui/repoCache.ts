import { openRepository, type Repository } from "../git/index.js";

/**
 * Module-level cache of open repositories, keyed by the (decoded) repo URL.
 * `openRepository` does real network I/O to read `info/refs`/`HEAD`, so we
 * must not reopen it on every navigation within the same repo -- the
 * `Repository` instance itself also caches parsed objects for its lifetime.
 */
const cache = new Map<string, Promise<Repository>>();

export function getRepository(url: string): Promise<Repository> {
  const existing = cache.get(url);
  if (existing) {
    return existing;
  }
  const opened = openRepository(url);
  cache.set(url, opened);
  // Don't cache a rejected open -- let the next attempt retry.
  opened.catch(() => {
    if (cache.get(url) === opened) {
      cache.delete(url);
    }
  });
  return opened;
}
