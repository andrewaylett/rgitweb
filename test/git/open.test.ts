import { describe, expect, it } from "@jest/globals";

import { openRepository } from "../../src/git/index.js";
import { RepositoryAccessError } from "../../src/git/types.js";
import { createFileFetch } from "../fixtures/fileFetch.js";
import { buildFixtureRepo, runGit } from "../fixtures/setup.js";
import { FIXTURE_URL, openFixtureRepository } from "../helpers.js";

describe("openRepository", () => {
  it("opens a valid dumb-http repo and reports its url", async () => {
    const { repo } = await openFixtureRepository();
    expect(repo.url).toBe(FIXTURE_URL);
  });

  it("reads HEAD as a symbolic ref to main", async () => {
    const { repo } = await openFixtureRepository();
    const head = await repo.head();
    expect(head.symref).toBe("refs/heads/main");

    const mainOid = runGit(["rev-parse", "refs/heads/main"]);
    expect(head.oid).toBe(mainOid);
  });

  it("lists refs including branches, lightweight and annotated tags", async () => {
    const { repo, fixture } = await openFixtureRepository();
    const refs = await repo.refs();
    const names = refs.map((r) => r.name);
    expect(names).toContain("refs/heads/main");
    expect(names).toContain(`refs/heads/${fixture.branchName}`);
    expect(names).toContain(`refs/tags/${fixture.lightweightTag}`);
    expect(names).toContain(`refs/tags/${fixture.annotatedTag}`);

    const annotated = refs.find(
      (r) => r.name === `refs/tags/${fixture.annotatedTag}`,
    );
    expect(annotated?.peeledOid).toBeDefined();
  });

  it("throws RepositoryAccessError with a hint on a 404 (non-git) url", async () => {
    await buildFixtureRepo();
    const fetchImpl = createFileFetch("/nonexistent-path-for-test");
    await expect(
      openRepository("http://fixture.invalid/not-a-repo", { fetch: fetchImpl }),
    ).rejects.toBeInstanceOf(RepositoryAccessError);
  });

  it("throws RepositoryAccessError with a hint on a network/CORS failure", async () => {
    const throwingFetch: typeof globalThis.fetch = () => {
      throw new TypeError("Failed to fetch");
    };
    let caught: unknown;
    try {
      await openRepository(FIXTURE_URL, { fetch: throwingFetch });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RepositoryAccessError);
    const err = caught as RepositoryAccessError;
    expect(err.hint.toLowerCase()).toContain("cors");
  });
});
