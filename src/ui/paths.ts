/**
 * URL builders for the hash-routed repo pages, all rooted at
 * `#/r/<encodeURIComponent(repoUrl)>/...`. Kept in one place so encoding
 * rules stay consistent between links and the route params that decode
 * them.
 */

function encodeSegments(path: string): string[] {
  return path
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment));
}

export function repoRoot(repoUrl: string): string {
  return `/r/${encodeURIComponent(repoUrl)}`;
}

export function summaryPath(repoUrl: string): string {
  return `${repoRoot(repoUrl)}/summary`;
}

export function refsPath(repoUrl: string): string {
  return `${repoRoot(repoUrl)}/refs`;
}

export function logPath(
  repoUrl: string,
  rev: string,
  options?: { readonly path?: string; readonly from?: string },
): string {
  const base = `${repoRoot(repoUrl)}/log/${encodeURIComponent(rev)}`;
  const params = new URLSearchParams();
  if (options?.path) {
    params.set("path", options.path);
  }
  if (options?.from) {
    params.set("from", options.from);
  }
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

export function commitPath(repoUrl: string, oid: string): string {
  return `${repoRoot(repoUrl)}/commit/${encodeURIComponent(oid)}`;
}

export function treePath(repoUrl: string, rev: string, path = ""): string {
  const segments = encodeSegments(path);
  return [
    `${repoRoot(repoUrl)}/tree`,
    encodeURIComponent(rev),
    ...segments,
  ].join("/");
}

export function blobPath(repoUrl: string, rev: string, path: string): string {
  const segments = encodeSegments(path);
  return [
    `${repoRoot(repoUrl)}/blob`,
    encodeURIComponent(rev),
    ...segments,
  ].join("/");
}

/**
 * Normalises a splat param (the already-decoded rest-of-path captured by a
 * `/*` route) by trimming stray slashes.
 *
 * React Router decodes matched path and splat segments itself (verified
 * against `matchRoutes` directly: both named params and splat segments come
 * back with real `/` characters, not `%2F`) before handing them to
 * `useParams`, so no further `decodeURIComponent` should be applied here --
 * doing so would silently mis-decode a path segment that happens to contain
 * a literal `%XX`-shaped sequence after the router's own decoding.
 */
export function decodeSplatPath(splat: string | undefined): string {
  if (!splat) {
    return "";
  }
  return splat
    .split("/")
    .filter((segment) => segment.length > 0)
    .join("/");
}

/** A short, human-friendly name for a repo URL, e.g. for the header title. */
export function repoDisplayName(repoUrl: string): string {
  const trimmed = repoUrl.replace(/\/+$/, "");
  const last = trimmed.split("/").pop() ?? trimmed;
  return last.replace(/\.git$/, "") || trimmed;
}
