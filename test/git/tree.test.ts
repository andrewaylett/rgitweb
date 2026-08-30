import { describe, expect, it } from "@jest/globals";

import { definite } from "../../src/git/assert.js";
import { runGit } from "../fixtures/setup.js";
import { openFixtureRepository } from "../helpers.js";

interface LsTreeRow {
  mode: string;
  type: string;
  oid: string;
  name: string;
}

function parseLsTree(output: string): LsTreeRow[] {
  return output
    .split("\n")
    .filter((l) => l.length > 0)
    .map((line) => {
      const [info, name] = line.split("\t");
      const [mode, type, oid] = definite(info, "malformed ls-tree line").split(
        " ",
      );
      // `git ls-tree` always pads the mode to 6 digits for display; the raw
      // tree object (and our parser) store it unpadded, e.g. "40000" for a
      // directory rather than "040000".
      const unpaddedMode = definite(mode, "missing mode").replace(
        /^0+(?=\d)/,
        "",
      );
      return {
        mode: unpaddedMode,
        type: definite(type, "missing type"),
        oid: definite(oid, "missing oid"),
        name: definite(name, "missing name"),
      };
    });
}

describe("tree parsing", () => {
  it("matches git ls-tree for the root tree, including a symlink and a subdirectory", async () => {
    const { repo } = await openFixtureRepository();
    const headOid = runGit(["rev-parse", "HEAD"]);
    const commit = await repo.getCommit(headOid);
    const entries = await repo.getTree(commit.tree);

    const expected = parseLsTree(runGit(["ls-tree", headOid]));
    expect(entries).toHaveLength(expected.length);

    for (const exp of expected) {
      const actual = entries.find((e) => e.name === exp.name);
      expect(actual).toBeDefined();
      expect(actual?.mode).toBe(exp.mode);
      expect(actual?.oid).toBe(exp.oid);
      expect(actual?.isDirectory).toBe(exp.type === "tree");
      expect(actual?.isSymlink).toBe(exp.mode === "120000");
      expect(actual?.isSubmodule).toBe(exp.type === "commit");
    }

    const symlinkEntry = entries.find((e) => e.isSymlink);
    expect(symlinkEntry).toBeDefined();
  });

  it("matches git ls-tree for a subdirectory", async () => {
    const { repo, fixture } = await openFixtureRepository();
    const headOid = runGit(["rev-parse", "HEAD"]);
    const dir = fixture.subdirFilePath.split("/").slice(0, -1).join("/");
    const entry = await repo.pathEntry(headOid, dir);
    expect(entry?.isDirectory).toBe(true);

    const entries = await repo.getTree((entry as { oid: string }).oid);
    const expected = parseLsTree(runGit(["ls-tree", `${headOid}:${dir}`]));
    expect(entries.map((e) => e.name).toSorted()).toEqual(
      expected.map((e) => e.name).toSorted(),
    );
  });
});
