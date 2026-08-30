import { openRepository } from "../src/git/index.js";
import { type Repository } from "../src/git/types.js";

import {
  createFileFetch,
  createNoRangeFileFetch,
} from "./fixtures/fileFetch.js";
import { buildFixtureRepo, type FixtureRepo } from "./fixtures/setup.js";

// createFileFetch serves files with `fixture.repoDir` as the root, so the
// repository's "URL" must map directly onto that root with no extra path
// segment (no repeated `/repo.git`).
export const FIXTURE_URL = "http://fixture.invalid";

export async function openFixtureRepository(options?: {
  noRange?: boolean;
}): Promise<{ repo: Repository; fixture: FixtureRepo }> {
  const fixture = await buildFixtureRepo();
  const fetchImpl = options?.noRange
    ? createNoRangeFileFetch(fixture.repoDir)
    : createFileFetch(fixture.repoDir);
  const repo = await openRepository(FIXTURE_URL, { fetch: fetchImpl });
  return { repo, fixture };
}
