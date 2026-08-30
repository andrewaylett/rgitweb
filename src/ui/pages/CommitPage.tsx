import { Link, useParams } from "react-router-dom";

import { ErrorPanel } from "../components/ErrorPanel.js";
import { FileDiff } from "../components/FileDiff.js";
import { LoadingPanel } from "../components/LoadingPanel.js";
import { OidLink } from "../components/OidLink.js";
import { RelativeDate } from "../components/RelativeDate.js";
import { useAsync } from "../hooks/useAsync.js";
import { useDocumentTitle } from "../hooks/useDocumentTitle.js";
import { repoDisplayName, treePath } from "../paths.js";
import { useRepo } from "../repoOutletContext.js";
import { diffTrees, type FileChange } from "../utils/treeDiff.js";
import { shortOid } from "../utils/format.js";
import { resolveCommitOid } from "../utils/resolveCommit.js";
import { type Commit, type Repository } from "../../git/index.js";

const AUTO_EXPAND_COUNT = 5;

interface CommitData {
  readonly commit: Commit;
  readonly changes: readonly FileChange[];
  readonly isRoot: boolean;
  readonly isMerge: boolean;
}

async function loadCommit(
  repository: Repository,
  oidOrRev: string,
): Promise<CommitData> {
  const oid = await resolveCommitOid(repository, oidOrRev);
  const commit = await repository.getCommit(oid);
  const isRoot = commit.parents.length === 0;
  const isMerge = commit.parents.length > 1;
  const firstParentOid = commit.parents[0];
  const parentTree = firstParentOid
    ? (await repository.getCommit(firstParentOid)).tree
    : undefined;
  const changes = await diffTrees(repository, parentTree, commit.tree);
  return { commit, changes, isRoot, isMerge };
}

export function CommitPage() {
  const { repository, url } = useRepo();
  const { oid: routeOid } = useParams<{ oid: string }>();
  const oidOrRev = routeOid ?? "";

  const state = useAsync(
    () => loadCommit(repository, oidOrRev),
    [repository, oidOrRev],
  );

  useDocumentTitle(
    `${repoDisplayName(url)} — commit ${state.status === "success" ? shortOid(state.data.commit.oid) : oidOrRev}`,
  );

  if (state.status === "loading") {
    return <LoadingPanel />;
  }
  if (state.status === "error") {
    return <ErrorPanel error={state.error} />;
  }

  const { commit, changes, isRoot, isMerge } = state.data;

  return (
    <div>
      <table className="commit-meta">
        <tbody>
          <tr>
            <th>commit</th>
            <td className="oid">{commit.oid}</td>
          </tr>
          <tr>
            <th>tree</th>
            <td>
              <Link to={treePath(url, commit.oid, "")} className="oid">
                {commit.tree}
              </Link>
            </td>
          </tr>
          <tr>
            <th>parent{commit.parents.length === 1 ? "" : "s"}</th>
            <td>
              {commit.parents.length === 0 ? (
                <span className="hint">none (root commit)</span>
              ) : (
                commit.parents.map((parentOid, index) => (
                  <span key={parentOid}>
                    {index > 0 && ", "}
                    <OidLink repoUrl={url} oid={parentOid} />
                  </span>
                ))
              )}
            </td>
          </tr>
          <tr>
            <th>author</th>
            <td>
              {commit.author.name} &lt;{commit.author.email}&gt; —{" "}
              <RelativeDate date={commit.author.date} />
            </td>
          </tr>
          <tr>
            <th>committer</th>
            <td>
              {commit.committer.name} &lt;{commit.committer.email}&gt; —{" "}
              <RelativeDate date={commit.committer.date} />
            </td>
          </tr>
        </tbody>
      </table>
      <pre className="commit-message">{commit.message}</pre>
      <h2>Changes</h2>
      {isRoot && (
        <p className="hint">
          Root commit — showing diff against the empty tree.
        </p>
      )}
      {isMerge && (
        <p className="hint">
          Merge commit — showing diff against the first parent only.
        </p>
      )}
      {changes.length === 0 ? (
        <p>No file changes.</p>
      ) : (
        <div className="file-diff-list">
          {changes.map((change, index) => (
            <FileDiff
              key={change.path}
              repository={repository}
              change={change}
              defaultOpen={index < AUTO_EXPAND_COUNT}
            />
          ))}
        </div>
      )}
    </div>
  );
}
