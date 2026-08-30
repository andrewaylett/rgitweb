import { describe, expect, it } from "@jest/globals";

import { runGit } from "../fixtures/setup.js";
import { openFixtureRepository } from "../helpers.js";

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of gen) {
    out.push(item);
  }
  return out;
}

describe("Repository.log", () => {
  it("walks history newest-first, matching git log --date-order", async () => {
    const { repo } = await openFixtureRepository();
    const headOid = runGit(["rev-parse", "HEAD"]);
    const expectedOids = runGit(["log", "--date-order", "--format=%H", headOid])
      .split("\n")
      .filter((l) => l.length > 0);

    const commits = await collect(repo.log(headOid));
    expect(commits.map((c) => c.oid)).toEqual(expectedOids);
  });

  it("respects limit", async () => {
    const { repo } = await openFixtureRepository();
    const headOid = runGit(["rev-parse", "HEAD"]);
    const commits = await collect(repo.log(headOid, { limit: 3 }));
    expect(commits).toHaveLength(3);

    const expectedFirstThree = runGit([
      "log",
      "--date-order",
      "--format=%H",
      "-n",
      "3",
      headOid,
    ])
      .split("\n")
      .filter((l) => l.length > 0);
    expect(commits.map((c) => c.oid)).toEqual(expectedFirstThree);
  });

  it("exposes both parents of the merge commit", async () => {
    const { repo } = await openFixtureRepository();
    const mergeOid = runGit(["rev-parse", "HEAD^1"]); // the merge is HEAD's parent
    const commit = await repo.getCommit(mergeOid);
    const expectedParents = runGit([
      "rev-parse",
      `${mergeOid}^1`,
      `${mergeOid}^2`,
    ]).split("\n");
    expect(commit.parents).toEqual(expectedParents);
  });

  it("path-filtered log only yields commits that changed the path", async () => {
    const { repo, fixture } = await openFixtureRepository();
    const headOid = runGit(["rev-parse", "HEAD"]);
    const expectedOids = runGit([
      "log",
      "--date-order",
      "--format=%H",
      headOid,
      "--",
      fixture.changedFilePath,
    ])
      .split("\n")
      .filter((l) => l.length > 0);

    const commits = await collect(
      repo.log(headOid, { path: fixture.changedFilePath }),
    );
    expect(commits.map((c) => c.oid)).toEqual(expectedOids);
    expect(commits.length).toBeGreaterThan(1);
  });

  it("path-filtered log for a file only ever touched once returns a single commit", async () => {
    const { repo, fixture } = await openFixtureRepository();
    const headOid = runGit(["rev-parse", "HEAD"]);
    const expectedOids = runGit([
      "log",
      "--date-order",
      "--format=%H",
      headOid,
      "--",
      fixture.symlinkPath,
    ])
      .split("\n")
      .filter((l) => l.length > 0);

    const commits = await collect(
      repo.log(headOid, { path: fixture.symlinkPath }),
    );
    expect(commits.map((c) => c.oid)).toEqual(expectedOids);
  });
});
