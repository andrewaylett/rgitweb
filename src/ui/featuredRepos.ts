/**
 * The start page lists only repositories configured at build time, rather
 * than accepting an arbitrary URL: most Git hosts don't send the CORS
 * headers this app needs (see AGENTS.md), so a free-text box mostly leads to
 * a wall of "check your host's CORS settings" errors. Deployments that want
 * to expose the box back can still do so by editing this file.
 *
 * `VITE_FEATURED_REPOS` lets the build inject a deployment-specific list
 * (see `.github/workflows/deploy.yml`) without touching source.
 */

export interface FeaturedRepo {
  readonly name: string;
  readonly url: string;
}

function parseFeaturedRepos(raw: string | undefined): readonly FeaturedRepo[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (entry): entry is FeaturedRepo =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as FeaturedRepo).name === "string" &&
        typeof (entry as FeaturedRepo).url === "string",
    );
  } catch {
    return [];
  }
}

export const featuredRepos: readonly FeaturedRepo[] = parseFeaturedRepos(
  import.meta.env.VITE_FEATURED_REPOS as string | undefined,
);
