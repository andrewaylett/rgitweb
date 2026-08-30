/**
 * Public surface of the Git data layer.
 *
 * This interface is the contract between the git core (`src/git/`) and the UI
 * (`src/ui/`). The UI imports only from `src/git/index.ts`; internals may
 * change freely as long as this surface holds.
 *
 * Everything is lazy and network-backed: implementations must fetch only what
 * is needed to answer each call, and must let the browser HTTP cache do its
 * job (no cache-busting headers; immutable pack data is range-requested).
 */

/** No enums by convention: object types as a const union. */
export const ObjectTypes = ["commit", "tree", "blob", "tag"] as const;
export type ObjectType = (typeof ObjectTypes)[number];

/** A 40-character lowercase hex SHA-1 object id. */
export type Oid = string;

export interface GitObject {
  readonly oid: Oid;
  readonly type: ObjectType;
  /** Raw object payload, without the "<type> <size>\0" header. */
  readonly data: Uint8Array;
}

export interface Person {
  readonly name: string;
  readonly email: string;
  /** Author/committer timestamp. */
  readonly date: Date;
  /** Timezone offset as written in the object, e.g. "+0100". */
  readonly tzOffset: string;
}

export interface Commit {
  readonly oid: Oid;
  readonly tree: Oid;
  readonly parents: readonly Oid[];
  readonly author: Person;
  readonly committer: Person;
  /** Full message; first line is the summary. */
  readonly message: string;
}

export interface TreeEntry {
  /** Octal mode string as stored, e.g. "100644", "40000", "120000", "160000". */
  readonly mode: string;
  readonly name: string;
  readonly oid: Oid;
  readonly isDirectory: boolean;
  readonly isSymlink: boolean;
  readonly isSubmodule: boolean;
}

export interface AnnotatedTag {
  readonly oid: Oid;
  readonly targetOid: Oid;
  readonly targetType: ObjectType;
  readonly name: string;
  readonly tagger: Person | undefined;
  readonly message: string;
}

export interface Ref {
  /** Full ref name, e.g. "refs/heads/main" or "refs/tags/v1.0". */
  readonly name: string;
  readonly oid: Oid;
  /** For annotated tags listed with a peeled entry in info/refs. */
  readonly peeledOid?: Oid;
}

export interface Head {
  /** Symbolic target, e.g. "refs/heads/main", when HEAD is symbolic. */
  readonly symref?: string;
  readonly oid: Oid;
}

export interface LogOptions {
  /** Maximum number of commits to yield. */
  readonly limit?: number;
  /** Restrict the walk to commits touching this path (slash-separated). */
  readonly path?: string;
}

/**
 * A read-only view of one remote repository. Obtain via `openRepository`.
 * Implementations cache parsed objects in memory for the lifetime of the
 * instance.
 */
export interface Repository {
  /** Normalised base URL of the repository (no trailing slash). */
  readonly url: string;

  head(): Promise<Head>;
  /** All refs advertised in info/refs plus any loose refs found. */
  refs(): Promise<readonly Ref[]>;

  /**
   * Resolve a ref name (full or shorthand like "main" or "v1.0"), or a full
   * hex oid, to an object id. Throws NotFoundError if nothing matches.
   */
  resolve(refOrOid: string): Promise<Oid>;

  getObject(oid: Oid): Promise<GitObject>;
  getCommit(oid: Oid): Promise<Commit>;
  getTree(oid: Oid): Promise<readonly TreeEntry[]>;
  getBlob(oid: Oid): Promise<Uint8Array>;
  getTag(oid: Oid): Promise<AnnotatedTag>;

  /**
   * Walk history from `start` (a commit oid), newest first, following all
   * parents (topological-ish, ordered by committer date like git log).
   */
  log(start: Oid, options?: LogOptions): AsyncGenerator<Commit>;

  /**
   * Resolve a slash-separated path within the tree of the given commit.
   * Returns undefined if the path does not exist. An empty path returns the
   * root tree as a synthetic directory entry.
   */
  pathEntry(commitOid: Oid, path: string): Promise<TreeEntry | undefined>;
}

export interface OpenOptions {
  /** Injectable fetch for testing; defaults to globalThis.fetch. */
  readonly fetch?: typeof globalThis.fetch;
}

/** Object or ref not present in the repository. */
export class NotFoundError extends Error {}

/**
 * The remote answered in a way that suggests it is not a dumb-HTTP Git
 * repository, or CORS blocked us. `hint` is user-presentable.
 */
export class RepositoryAccessError extends Error {
  constructor(
    message: string,
    readonly hint: string,
  ) {
    super(message);
  }
}
