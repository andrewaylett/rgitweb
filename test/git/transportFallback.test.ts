import { describe, expect, it } from "@jest/globals";

import { runGit } from "../fixtures/setup.js";
import { openFixtureRepository } from "../helpers.js";

describe("range-less server fallback", () => {
  it("reads packed objects correctly even when the server ignores Range headers", async () => {
    const { repo } = await openFixtureRepository({ noRange: true });
    const parentOid = runGit(["rev-parse", "HEAD^1"]); // packed, since it predates repack's follow-up commit
    const commit = await repo.getCommit(parentOid);
    expect(commit.oid).toBe(parentOid);
    expect(commit.tree).toBe(runGit(["rev-parse", `${parentOid}^{tree}`]));
  });

  it("reads a deltified large blob correctly without range support", async () => {
    const { repo, fixture } = await openFixtureRepository({ noRange: true });
    const headOid = runGit(["rev-parse", "HEAD"]);
    const expectedOid = runGit([
      "rev-parse",
      `${headOid}:${fixture.largeFilePath}`,
    ]);
    const blob = await repo.getBlob(expectedOid);
    const expectedContent = runGit([
      "show",
      `${headOid}:${fixture.largeFilePath}`,
    ]);
    expect(Buffer.from(blob).toString("utf8").trimEnd()).toBe(
      expectedContent.trimEnd(),
    );
  });
});
