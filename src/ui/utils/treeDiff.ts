import { type Oid, type Repository } from "../../git/index.js";

export type ChangeStatus = "added" | "removed" | "modified";

export interface FileChange {
  readonly path: string;
  readonly status: ChangeStatus;
  readonly oldOid?: Oid;
  readonly newOid?: Oid;
  readonly oldMode?: string;
  readonly newMode?: string;
  readonly isSubmodule: boolean;
}

/**
 * Recursively diffs two trees (either may be `undefined` for "empty tree",
 * used for additions/deletions/root commits) into a flat, path-sorted list
 * of file-level changes. Directories themselves never appear in the output.
 */
export async function diffTrees(
  repository: Repository,
  oldTree: Oid | undefined,
  newTree: Oid | undefined,
): Promise<FileChange[]> {
  const changes: FileChange[] = [];
  await diffTreesInto(repository, oldTree, newTree, "", changes);
  changes.sort((a, b) => a.path.localeCompare(b.path));
  return changes;
}

async function diffTreesInto(
  repository: Repository,
  oldTree: Oid | undefined,
  newTree: Oid | undefined,
  prefix: string,
  out: FileChange[],
): Promise<void> {
  const [oldEntries, newEntries] = await Promise.all([
    oldTree ? repository.getTree(oldTree) : Promise.resolve([]),
    newTree ? repository.getTree(newTree) : Promise.resolve([]),
  ]);
  const oldByName = new Map(oldEntries.map((entry) => [entry.name, entry]));
  const newByName = new Map(newEntries.map((entry) => [entry.name, entry]));
  const names = new Set([...oldByName.keys(), ...newByName.keys()]);

  const pending: Promise<void>[] = [];
  for (const name of names) {
    const before = oldByName.get(name);
    const after = newByName.get(name);
    const path = prefix ? `${prefix}/${name}` : name;

    if (before && after) {
      if (before.isDirectory && after.isDirectory) {
        if (before.oid !== after.oid) {
          pending.push(
            diffTreesInto(repository, before.oid, after.oid, path, out),
          );
        }
      } else if (before.isDirectory !== after.isDirectory) {
        pending.push(
          removeEntry(repository, before, path, out),
          addEntry(repository, after, path, out),
        );
      } else if (before.oid !== after.oid || before.mode !== after.mode) {
        out.push({
          path,
          status: "modified",
          oldOid: before.oid,
          newOid: after.oid,
          oldMode: before.mode,
          newMode: after.mode,
          isSubmodule: after.isSubmodule || before.isSubmodule,
        });
      }
    } else if (after) {
      pending.push(addEntry(repository, after, path, out));
    } else if (before) {
      pending.push(removeEntry(repository, before, path, out));
    }
  }
  await Promise.all(pending);
}

async function addEntry(
  repository: Repository,
  entry: {
    readonly isDirectory: boolean;
    readonly oid: Oid;
    readonly mode: string;
    readonly isSubmodule: boolean;
  },
  path: string,
  out: FileChange[],
): Promise<void> {
  if (entry.isDirectory) {
    await diffTreesInto(repository, undefined, entry.oid, path, out);
    return;
  }
  out.push({
    path,
    status: "added",
    newOid: entry.oid,
    newMode: entry.mode,
    isSubmodule: entry.isSubmodule,
  });
}

async function removeEntry(
  repository: Repository,
  entry: {
    readonly isDirectory: boolean;
    readonly oid: Oid;
    readonly mode: string;
    readonly isSubmodule: boolean;
  },
  path: string,
  out: FileChange[],
): Promise<void> {
  if (entry.isDirectory) {
    await diffTreesInto(repository, entry.oid, undefined, path, out);
    return;
  }
  out.push({
    path,
    status: "removed",
    oldOid: entry.oid,
    oldMode: entry.mode,
    isSubmodule: entry.isSubmodule,
  });
}
