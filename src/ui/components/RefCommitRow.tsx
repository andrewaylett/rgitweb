import { Link } from "react-router-dom";

import { useAsync } from "../hooks/useAsync.js";
import { treePath } from "../paths.js";
import { summaryLine } from "../utils/format.js";
import { peelToCommit } from "../utils/resolveCommit.js";
import { type Ref, type Repository } from "../../git/index.js";

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
  reference,
}: {
  readonly repoUrl: string;
  readonly repository: Repository;
  readonly reference: Ref;
}) {
  const name = reference.name.replace(/^refs\/(?:heads|tags)\//, "");
  const state = useAsync(
    () =>
      peelToCommit(repository, reference.oid).then((oid) =>
        repository.getCommit(oid),
      ),
    [repository, reference.oid],
  );
  return (
    <tr>
      <td className="ref-name">
        <Link to={treePath(repoUrl, reference.oid)}>{name}</Link>
      </td>
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
