import { describe, expect, it } from "@jest/globals";

import { definite } from "../../src/git/assert.js";
import { openRepository } from "../../src/git/index.js";
import { createFileFetch, requestUrl } from "../fixtures/fileFetch.js";
import { buildFixtureRepo, runGit } from "../fixtures/setup.js";
import { FIXTURE_URL, openFixtureRepository } from "../helpers.js";

describe("reading objects", () => {
  it("reads a loose commit (the post-repack HEAD) matching git cat-file", async () => {
    const { repo } = await openFixtureRepository();
    const headOid = runGit(["rev-parse", "HEAD"]);
    // Sanity: this object should indeed be loose (uncompressed on disk),
    // since it was committed after `git repack`.
    const commit = await repo.getCommit(headOid);

    expect(commit.oid).toBe(headOid);
    expect(commit.tree).toBe(runGit(["rev-parse", `${headOid}^{tree}`]));
    expect(commit.parents).toEqual([runGit(["rev-parse", `${headOid}^1`])]);
    expect(commit.message).toBe(
      runGit(["log", "-1", "--format=%B", headOid]) + "\n",
    );
    expect(commit.author.name).toBe(
      runGit(["log", "-1", "--format=%an", headOid]),
    );
    expect(commit.author.email).toBe(
      runGit(["log", "-1", "--format=%ae", headOid]),
    );
    expect(commit.committer.name).toBe(
      runGit(["log", "-1", "--format=%cn", headOid]),
    );
  });

  it("reads a packed commit (an ancestor, after repack) matching git cat-file", async () => {
    const { repo } = await openFixtureRepository();
    const parentOid = runGit(["rev-parse", "HEAD^1"]);
    const commit = await repo.getCommit(parentOid);
    expect(commit.oid).toBe(parentOid);
    expect(commit.tree).toBe(runGit(["rev-parse", `${parentOid}^{tree}`]));
    expect(commit.parents).toHaveLength(2); // the merge commit
  });

  it("reads a blob (loose) matching git show", async () => {
    const { repo, fixture } = await openFixtureRepository();
    const headOid = runGit(["rev-parse", "HEAD"]);
    const commit = await repo.getCommit(headOid);
    const entry = await repo.pathEntry(commit.oid, fixture.changedFilePath);
    expect(entry).toBeDefined();
    const blob = await repo.getBlob((entry as { oid: string }).oid);
    const expected =
      runGit(["show", `${headOid}:${fixture.changedFilePath}`]) + "\n";
    expect(Buffer.from(blob).toString("utf8")).toBe(expected);
  });

  it("reads a large, deltified blob matching git show", async () => {
    const { repo, fixture } = await openFixtureRepository();
    const headOid = runGit(["rev-parse", "HEAD"]);
    const entry = await repo.pathEntry(headOid, fixture.largeFilePath);
    expect(entry).toBeDefined();
    const blob = await repo.getBlob((entry as { oid: string }).oid);
    const expectedOid = runGit([
      "rev-parse",
      `${headOid}:${fixture.largeFilePath}`,
    ]);
    expect((entry as { oid: string }).oid).toBe(expectedOid);
    expect(blob.length).toBeGreaterThan(200 * 1024 - 1024);
  });

  it("reads an annotated tag matching git cat-file", async () => {
    const { repo, fixture } = await openFixtureRepository();
    const tagOid = runGit(["rev-parse", `refs/tags/${fixture.annotatedTag}`]);
    const tag = await repo.getTag(tagOid);
    expect(tag.name).toBe(fixture.annotatedTag);
    expect(tag.targetType).toBe("commit");
    expect(tag.targetOid).toBe(
      runGit(["rev-parse", `refs/tags/${fixture.annotatedTag}^{commit}`]),
    );
    expect(tag.tagger).toBeDefined();
    expect(tag.message.trim()).toBe(fixture.annotatedTagMessage.trim());
  });

  it("detects a tampered loose object via oid verification", async () => {
    const fixture = await buildFixtureRepo();
    const headOid = runGit(["rev-parse", "HEAD"]);
    const objUrlSuffix = `/objects/${headOid.slice(0, 2)}/${headOid.slice(2)}`;

    const baseFetch = createFileFetch(fixture.repoDir);
    // Wrap the real file-serving fetch so it corrupts exactly the one object
    // under test, without touching the shared fixture on disk (other test
    // files run concurrently against the same fixture directory).
    const tamperingFetch: typeof globalThis.fetch = async (input, init) => {
      const url = requestUrl(input);
      const response = await baseFetch(input, init);
      if (!url.endsWith(objUrlSuffix) || !response.ok) {
        return response;
      }
      const tampered = new Uint8Array(await response.arrayBuffer());
      const mid = Math.floor(tampered.length / 2);
      const original = definite(tampered[mid], "empty tampered object body");
      tampered[mid] = original ^ 0xff;
      return new Response(tampered, { status: response.status });
    };

    const repo = await openRepository(FIXTURE_URL, { fetch: tamperingFetch });
    await expect(repo.getCommit(headOid)).rejects.toThrow();
  });
});
