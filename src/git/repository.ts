/** Ties transport + refs + loose + pack + object parsing together into a Repository. */

import { definite } from "./assert.js";
import { readLooseObject, type RawObject } from "./loose.js";
import { parseCommit, parseTag, parseTree, verifyOid } from "./objects.js";
import { findObjectInPacks } from "./pack.js";
import {
  fetchHead,
  fetchInfoRefs,
  fetchPackList,
  resolveRefName,
} from "./refs.js";
import { type Transport } from "./transport.js";
import {
  type AnnotatedTag,
  type Commit,
  type GitObject,
  type Head,
  type LogOptions,
  NotFoundError,
  type Oid,
  type Ref,
  type Repository,
  type TreeEntry,
} from "./types.js";

const MAX_OBJECT_CACHE = 2000;

export function createRepositoryImpl(
  baseUrl: string,
  transport: Transport,
): Repository {
  let refsPromise: Promise<Ref[]> | undefined;
  let headPromise: Promise<Head> | undefined;
  let packNamesPromise: Promise<string[]> | undefined;

  // Simple insertion-order-eviction cache; Map preserves insertion order and
  // re-inserting a key on access moves it to the end, giving cheap LRU-ish
  // behaviour without extra bookkeeping.
  const objectCache = new Map<Oid, GitObject>();

  function cacheGet(oid: Oid): GitObject | undefined {
    const hit = objectCache.get(oid);
    if (hit) {
      objectCache.delete(oid);
      objectCache.set(oid, hit);
    }
    return hit;
  }

  function cacheSet(obj: GitObject): void {
    objectCache.delete(obj.oid);
    objectCache.set(obj.oid, obj);
    if (objectCache.size > MAX_OBJECT_CACHE) {
      const oldestKey = objectCache.keys().next().value;
      if (oldestKey !== undefined) {
        objectCache.delete(oldestKey);
      }
    }
  }

  function getRefs(): Promise<Ref[]> {
    refsPromise ??= fetchInfoRefs(transport, baseUrl);
    return refsPromise;
  }

  function getHead(): Promise<Head> {
    headPromise ??= getRefs().then((refs) =>
      fetchHead(transport, baseUrl, refs),
    );
    return headPromise;
  }

  function getPackNames(): Promise<string[]> {
    packNamesPromise ??= fetchPackList(transport, baseUrl);
    return packNamesPromise;
  }

  async function getRawObject(oid: Oid): Promise<GitObject> {
    const cached = cacheGet(oid);
    if (cached) {
      return cached;
    }

    const loose = await readLooseObject(transport, baseUrl, oid);
    if (loose) {
      await verifyOid(oid, loose.type, loose.data);
      const obj: GitObject = { oid, type: loose.type, data: loose.data };
      cacheSet(obj);
      return obj;
    }

    const packNames = await getPackNames();
    const resolveRefDelta = (baseOid: Oid): Promise<RawObject> =>
      getRawObject(baseOid);
    const packed = await findObjectInPacks(
      transport,
      baseUrl,
      packNames,
      oid,
      resolveRefDelta,
    );
    if (packed) {
      await verifyOid(oid, packed.type, packed.data);
      const obj: GitObject = { oid, type: packed.type, data: packed.data };
      cacheSet(obj);
      return obj;
    }

    throw new NotFoundError(`Object not found: ${oid}`);
  }

  async function getCommit(oid: Oid): Promise<Commit> {
    const obj = await getRawObject(oid);
    if (obj.type !== "commit") {
      throw new Error(`${oid} is not a commit (got ${obj.type})`);
    }
    return parseCommit(oid, obj.data);
  }

  async function getTree(oid: Oid): Promise<readonly TreeEntry[]> {
    const obj = await getRawObject(oid);
    if (obj.type !== "tree") {
      throw new Error(`${oid} is not a tree (got ${obj.type})`);
    }
    return parseTree(oid, obj.data);
  }

  async function getBlob(oid: Oid): Promise<Uint8Array> {
    const obj = await getRawObject(oid);
    if (obj.type !== "blob") {
      throw new Error(`${oid} is not a blob (got ${obj.type})`);
    }
    return obj.data;
  }

  async function getTag(oid: Oid): Promise<AnnotatedTag> {
    const obj = await getRawObject(oid);
    if (obj.type !== "tag") {
      throw new Error(`${oid} is not a tag (got ${obj.type})`);
    }
    return parseTag(oid, obj.data);
  }

  async function resolve(refOrOid: string): Promise<Oid> {
    const [refs, head] = await Promise.all([getRefs(), getHead()]);
    return resolveRefName(refs, head, refOrOid);
  }

  async function pathEntry(
    commitOid: Oid,
    path: string,
  ): Promise<TreeEntry | undefined> {
    const commit = await getCommit(commitOid);
    if (path === "") {
      return {
        mode: "40000",
        name: "",
        oid: commit.tree,
        isDirectory: true,
        isSymlink: false,
        isSubmodule: false,
      };
    }

    const parts = path.split("/").filter((p) => p.length > 0);
    let currentTreeOid = commit.tree;
    let entry: TreeEntry | undefined;

    for (const [i, part] of parts.entries()) {
      const entries = await getTree(currentTreeOid);
      const found = entries.find((e) => e.name === part);
      if (!found) {
        return undefined;
      }
      entry = found;
      if (i < parts.length - 1) {
        if (!found.isDirectory) {
          return undefined;
        }
        currentTreeOid = found.oid;
      }
    }

    return entry;
  }

  /** True if `commit` changed `path` relative to every one of its parents. */
  async function commitTouchesPath(
    commit: Commit,
    path: string,
  ): Promise<boolean> {
    const entry = await pathEntry(commit.oid, path);
    const oidHere = entry?.oid;

    if (commit.parents.length === 0) {
      return oidHere !== undefined;
    }

    for (const parentOid of commit.parents) {
      const parentEntry = await pathEntry(parentOid, path);
      if (parentEntry?.oid === oidHere) {
        return false;
      }
    }
    return true;
  }

  async function* log(
    start: Oid,
    options?: LogOptions,
  ): AsyncGenerator<Commit> {
    const limit = options?.limit;
    const path = options?.path;

    const seen = new Set<Oid>();
    // Small sorted-by-committer-date-desc worklist. Repositories browsed by
    // this app are small enough that a naive sort-on-insert is fine; a real
    // heap would only matter for very wide/deep histories.
    const pending: Commit[] = [];

    async function enqueue(oid: Oid): Promise<void> {
      if (seen.has(oid)) {
        return;
      }
      seen.add(oid);
      const commit = await getCommit(oid);
      let insertAt = pending.length;
      while (insertAt > 0) {
        const before = definite(
          pending[insertAt - 1],
          "worklist index out of range",
        );
        if (before.committer.date >= commit.committer.date) {
          break;
        }
        insertAt--;
      }
      pending.splice(insertAt, 0, commit);
    }

    await enqueue(start);
    let yielded = 0;

    while (pending.length > 0) {
      const commit = definite(pending.shift(), "worklist unexpectedly empty");

      const include =
        path === undefined || (await commitTouchesPath(commit, path));
      if (include) {
        yield commit;
        yielded++;
        if (limit !== undefined && yielded >= limit) {
          return;
        }
      }

      for (const parentOid of commit.parents) {
        await enqueue(parentOid);
      }
    }
  }

  return {
    url: baseUrl,
    head: getHead,
    refs: getRefs,
    resolve,
    getObject: getRawObject,
    getCommit,
    getTree,
    getBlob,
    getTag,
    log,
    pathEntry,
  };
}
