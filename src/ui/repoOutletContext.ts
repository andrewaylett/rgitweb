import { useOutletContext } from "react-router-dom";

import { type Repository } from "../git/index.js";

export interface RepoOutletContext {
  readonly repository: Repository;
  /** The decoded repo URL, as passed to `openRepository`. */
  readonly url: string;
  /** Shorthand name of the default branch (or a short oid if HEAD is detached). */
  readonly defaultRev: string;
}

export function useRepo(): RepoOutletContext {
  return useOutletContext<RepoOutletContext>();
}
