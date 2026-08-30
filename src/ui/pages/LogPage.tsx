import { useParams, useSearchParams, Link } from "react-router-dom";

import { ErrorPanel } from "../components/ErrorPanel.js";
import { LoadingPanel } from "../components/LoadingPanel.js";
import { OidLink } from "../components/OidLink.js";
import { RelativeDate } from "../components/RelativeDate.js";
import { useAsync } from "../hooks/useAsync.js";
import { useDocumentTitle } from "../hooks/useDocumentTitle.js";
import { logPath, repoDisplayName } from "../paths.js";
import { useRepo } from "../repoOutletContext.js";
import { summaryLine } from "../utils/format.js";
import { resolveCommitOid } from "../utils/resolveCommit.js";
import { type Commit, type Oid, type Repository } from "../../git/index.js";

const PAGE_SIZE = 50;

interface LogPageResult {
  readonly commits: readonly Commit[];
  readonly hasMore: boolean;
}

async function fetchPage(
  repository: Repository,
  rev: string,
  from: Oid | undefined,
  path: string | undefined,
): Promise<LogPageResult> {
  const startOid = from ?? (await resolveCommitOid(repository, rev));
  const commits: Commit[] = [];
  let skippedCursor = from === undefined;
  for await (const commit of repository.log(startOid, {
    path,
    limit: PAGE_SIZE + 2,
  })) {
    if (!skippedCursor) {
      if (commit.oid === from) {
        skippedCursor = true;
      }
      continue;
    }
    commits.push(commit);
    if (commits.length > PAGE_SIZE) {
      break;
    }
  }
  const hasMore = commits.length > PAGE_SIZE;
  return { commits: commits.slice(0, PAGE_SIZE), hasMore };
}

export function LogPage() {
  const { repository, url } = useRepo();
  const { ref: routeRev } = useParams<{ ref: string }>();
  const rev = routeRev ?? "";
  const [searchParams] = useSearchParams();
  const path = searchParams.get("path") ?? undefined;
  const from = searchParams.get("from") ?? undefined;

  useDocumentTitle(
    `${repoDisplayName(url)} — log (${rev}${path ? `: ${path}` : ""})`,
  );

  const state = useAsync(
    () => fetchPage(repository, rev, from, path),
    [repository, rev, from, path],
  );

  if (state.status === "loading") {
    return <LoadingPanel />;
  }
  if (state.status === "error") {
    return <ErrorPanel error={state.error} />;
  }

  const { commits, hasMore } = state.data;
  const last = commits.at(-1);

  return (
    <div>
      <h2>
        Log: {rev}
        {path && <span> — {path}</span>}
      </h2>
      <table className="log-table">
        <tbody>
          {commits.map((commit) => (
            <tr key={commit.oid}>
              <td>
                <OidLink repoUrl={url} oid={commit.oid} />
              </td>
              <td className="summary">{summaryLine(commit.message)}</td>
              <td>{commit.author.name}</td>
              <td>
                <RelativeDate date={commit.author.date} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {commits.length === 0 && <p>No commits.</p>}
      {hasMore && last && (
        <p>
          <Link to={logPath(url, rev, { path, from: last.oid })}>older →</Link>
        </p>
      )}
    </div>
  );
}
