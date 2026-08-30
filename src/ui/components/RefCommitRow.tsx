import { type ReactNode } from "react";

import { useAsync } from "../hooks/useAsync.js";
import { summaryLine } from "../utils/format.js";
import { peelToCommit } from "../utils/resolveCommit.js";
import { type Oid, type Repository } from "../../git/index.js";

import { OidLink } from "./OidLink.js";
import { RelativeDate } from "./RelativeDate.js";

/**
 * Table row showing a ref name plus the summary of the commit it points at.
 * Fetches that commit lazily/independently so a slow one doesn't block the
 * rest of the ref list from rendering.
 */
export function RefCommitRow({
  repoUrl,
  repository,
  name,
  nameElement,
  commitOid,
}: {
  readonly repoUrl: string;
  readonly repository: Repository;
  readonly name: string;
  /** Optional pre-rendered label, defaults to plain `name`. */
  readonly nameElement?: ReactNode;
  /** A commit oid, or a (possibly annotated-tag) oid that peels to one. */
  readonly commitOid: Oid;
}) {
  const state = useAsync(
    () =>
      peelToCommit(repository, commitOid).then((oid) =>
        repository.getCommit(oid),
      ),
    [repository, commitOid],
  );
  return (
    <tr>
      <td className="ref-name">{nameElement ?? name}</td>
      {state.status === "success" ? (
        <>
          <td>
            <OidLink repoUrl={repoUrl} oid={state.data.oid} />
          </td>
          <td className="summary">{summaryLine(state.data.message)}</td>
          <td>{state.data.author.name}</td>
          <td>
            <RelativeDate date={state.data.author.date} />
          </td>
        </>
      ) : state.status === "error" ? (
        <td colSpan={4} className="error-inline">
          failed to load
        </td>
      ) : (
        <td colSpan={4}>…</td>
      )}
    </tr>
  );
}
