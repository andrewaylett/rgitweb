import { describe, expect, it } from "@jest/globals";

import { NotFoundError } from "../../src/git/types.js";
import { runGit } from "../fixtures/setup.js";
import { openFixtureRepository } from "../helpers.js";

describe("Repository.resolve", () => {
  it("resolves a full 40-hex oid to itself", async () => {
    const { repo } = await openFixtureRepository();
    const oid = runGit(["rev-parse", "refs/heads/main"]);
    await expect(repo.resolve(oid)).resolves.toBe(oid);
  });

  it("resolves branch shorthand", async () => {
    const { repo, fixture } = await openFixtureRepository();
    const oid = runGit(["rev-parse", `refs/heads/${fixture.branchName}`]);
    await expect(repo.resolve(fixture.branchName)).resolves.toBe(oid);
  });

  it("resolves tag shorthand (lightweight and annotated)", async () => {
    const { repo, fixture } = await openFixtureRepository();
    const lwOid = runGit(["rev-parse", `refs/tags/${fixture.lightweightTag}`]);
    await expect(repo.resolve(fixture.lightweightTag)).resolves.toBe(lwOid);

    const annotatedOid = runGit([
      "rev-parse",
      `refs/tags/${fixture.annotatedTag}`,
    ]);
    await expect(repo.resolve(fixture.annotatedTag)).resolves.toBe(
      annotatedOid,
    );
  });

  it("resolves HEAD", async () => {
    const { repo } = await openFixtureRepository();
    const head = await repo.head();
    await expect(repo.resolve("HEAD")).resolves.toBe(head.oid);
  });

  it("resolves full ref names", async () => {
    const { repo } = await openFixtureRepository();
    const oid = runGit(["rev-parse", "refs/heads/main"]);
    await expect(repo.resolve("refs/heads/main")).resolves.toBe(oid);
  });

  it("throws NotFoundError for a nonexistent ref", async () => {
    const { repo } = await openFixtureRepository();
    await expect(repo.resolve("no-such-branch")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
