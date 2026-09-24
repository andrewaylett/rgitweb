import { Link } from "react-router";

import { ErrorPanel } from "../components/ErrorPanel.js";
import { LoadingPanel } from "../components/LoadingPanel.js";
import { OidLink } from "../components/OidLink.js";
import { Readme } from "../components/Readme.js";
import { RefCommitRow } from "../components/RefCommitRow.js";
import { RelativeDate } from "../components/RelativeDate.js";
import { useAsync } from "../hooks/useAsync.js";
import { useDocumentTitle } from "../hooks/useDocumentTitle.js";
import { logPath, repoDisplayName } from "../paths.js";
import { useRepo } from "../repoOutletContext.js";
import { summaryLine } from "../utils/format.js";
import {
  type Commit,
  type Head,
  type Ref,
  type Repository,
} from "../../git/index.js";

const RECENT_COMMIT_COUNT = 10;

interface SummaryData {
  readonly head: Head;
  readonly headTreeOid: string;
  readonly refs: readonly Ref[];
  readonly commits: readonly Commit[];
}

async function loadSummary(repository: Repository): Promise<SummaryData> {
  const head = await repository.head();
  const [refs, commits] = await Promise.all([
    repository.refs(),
    collectCommits(repository, head.oid, RECENT_COMMIT_COUNT),
  ]);
  const headCommit = await repository.getCommit(head.oid);
  return { head, headTreeOid: headCommit.tree, refs, commits };
}

async function collectCommits(
  repository: Repository,
  start: string,
  limit: number,
): Promise<Commit[]> {
  const out: Commit[] = [];
  for await (const commit of repository.log(start, { limit })) {
    out.push(commit);
    if (out.length >= limit) {
      break;
    }
  }
  return out;
}

export function SummaryPage() {
  const { repository, url, defaultRev } = useRepo();
  useDocumentTitle(`${repoDisplayName(url)} — summary`);
  const state = useAsync(() => loadSummary(repository), [repository]);

  if (state.status === "loading") {
    return <LoadingPanel />;
  }
  if (state.status === "error") {
    return <ErrorPanel error={state.error} />;
  }

  const { refs, commits } = state.data;
  const branches = refs.filter((ref) => ref.name.startsWith("refs/heads/"));
  const tags = refs.filter((ref) => ref.name.startsWith("refs/tags/"));

  return (
    <div>
      <section>
        <h2>Branches</h2>
        <table className="ref-table">
          <tbody>
            {branches.map((ref) => (
              <RefCommitRow
                key={ref.name}
                repoUrl={url}
                repository={repository}
                reference={ref}
              />
            ))}
          </tbody>
        </table>
      </section>
      <section>
        <h2>Tags</h2>
        <table className="ref-table">
          <tbody>
            {tags.map((ref) => (
              <RefCommitRow
                key={ref.name}
                repoUrl={url}
                repository={repository}
                reference={ref}
              />
            ))}
          </tbody>
        </table>
      </section>
      <section>
        <h2>Recent commits</h2>
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
        <p>
          <Link to={logPath(url, defaultRev)}>full log →</Link>
        </p>
      </section>
      <Readme repository={repository} treeOid={state.data.headTreeOid} />
    </div>
  );
}
