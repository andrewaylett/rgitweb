import { describe, expect, it } from "@jest/globals";

import { runGit } from "../fixtures/setup.js";
import { openFixtureRepository } from "../helpers.js";

describe("Repository.pathEntry", () => {
  it("returns a synthetic root entry for an empty path", async () => {
    const { repo } = await openFixtureRepository();
    const headOid = runGit(["rev-parse", "HEAD"]);
    const commit = await repo.getCommit(headOid);
    const entry = await repo.pathEntry(headOid, "");
    expect(entry).toEqual({
      mode: "40000",
      name: "",
      oid: commit.tree,
      isDirectory: true,
      isSymlink: false,
      isSubmodule: false,
    });
  });

  it("resolves a nested file path", async () => {
    const { repo, fixture } = await openFixtureRepository();
    const headOid = runGit(["rev-parse", "HEAD"]);
    const entry = await repo.pathEntry(headOid, fixture.subdirFilePath);
    expect(entry).toBeDefined();
    expect(entry?.isDirectory).toBe(false);
    const expectedOid = runGit([
      "rev-parse",
      `${headOid}:${fixture.subdirFilePath}`,
    ]);
    expect(entry?.oid).toBe(expectedOid);
  });

  it("resolves a nested directory path", async () => {
    const { repo, fixture } = await openFixtureRepository();
    const headOid = runGit(["rev-parse", "HEAD"]);
    const dir = fixture.subdirFilePath.split("/").slice(0, -1).join("/");
    const entry = await repo.pathEntry(headOid, dir);
    expect(entry?.isDirectory).toBe(true);
    const expectedOid = runGit(["rev-parse", `${headOid}:${dir}`]);
    expect(entry?.oid).toBe(expectedOid);
  });

  it("returns undefined for a nonexistent path", async () => {
    const { repo } = await openFixtureRepository();
    const headOid = runGit(["rev-parse", "HEAD"]);
    const entry = await repo.pathEntry(headOid, "no/such/path.txt");
    expect(entry).toBeUndefined();
  });

  it("returns undefined when a path component is treated as a directory but is a file", async () => {
    const { repo, fixture } = await openFixtureRepository();
    const headOid = runGit(["rev-parse", "HEAD"]);
    const entry = await repo.pathEntry(
      headOid,
      `${fixture.changedFilePath}/nope`,
    );
    expect(entry).toBeUndefined();
  });
});
