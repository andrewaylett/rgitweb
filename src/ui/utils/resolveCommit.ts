import { type Oid, type Repository } from "../../git/index.js";

const MAX_TAG_HOPS = 10;

/**
 * Peels an object oid through any chain of annotated tags until it reaches
 * something that isn't a tag (normally a commit).
 *
 * `Repository.resolve` only maps a ref name to *an* object id -- for an
 * annotated tag that is the tag object's own oid, not the commit it points
 * at. `Ref.peeledOid` covers the common case (an advertised `^{}` peel
 * entry), but loose refs and ordinary tag oids passed straight into a URL
 * don't carry one, so any UI code that needs a commit must peel itself.
 */
export async function peelToCommit(
  repository: Repository,
  oid: Oid,
): Promise<Oid> {
  let current = oid;
  for (let hop = 0; hop < MAX_TAG_HOPS; hop++) {
    const obj = await repository.getObject(current);
    if (obj.type !== "tag") {
      return current;
    }
    const tag = await repository.getTag(current);
    current = tag.targetOid;
  }
  return current;
}

/** Resolves a rev (ref name or oid) to a commit oid, peeling through annotated tags. */
export async function resolveCommitOid(
  repository: Repository,
  rev: string,
): Promise<Oid> {
  const oid = await repository.resolve(rev);
  return peelToCommit(repository, oid);
}
