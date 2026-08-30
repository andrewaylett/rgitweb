import { lazy, Suspense } from "react";

import { Link } from "react-router-dom";

import { ErrorPanel } from "../components/ErrorPanel.js";
import { LoadingPanel } from "../components/LoadingPanel.js";
import { OidLink } from "../components/OidLink.js";
import { RefCommitRow } from "../components/RefCommitRow.js";
import { RelativeDate } from "../components/RelativeDate.js";
import { useAsync } from "../hooks/useAsync.js";
import { useDocumentTitle } from "../hooks/useDocumentTitle.js";
import { logPath, repoDisplayName } from "../paths.js";
import { useRepo } from "../repoOutletContext.js";
import { isBinary } from "../utils/binary.js";
import { summaryLine } from "../utils/format.js";
import {
  type Commit,
  type Head,
  type Ref,
  type Repository,
} from "../../git/index.js";

const ReactMarkdown = lazy(() => import("react-markdown"));

const README_NAMES = ["README.md", "README", "README.txt"];
const RECENT_COMMIT_COUNT = 10;

interface SummaryData {
  readonly head: Head;
  readonly refs: readonly Ref[];
  readonly commits: readonly Commit[];
  readonly readme: { readonly name: string; readonly text: string } | undefined;
}

async function loadSummary(repository: Repository): Promise<SummaryData> {
  const head = await repository.head();
  const [refs, commits, readme] = await Promise.all([
    repository.refs(),
    collectCommits(repository, head.oid, RECENT_COMMIT_COUNT),
    findReadme(repository, head.oid),
  ]);
  return { head, refs, commits, readme };
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

async function findReadme(
  repository: Repository,
  commitOid: string,
): Promise<{ name: string; text: string } | undefined> {
  for (const name of README_NAMES) {
    const entry = await repository.pathEntry(commitOid, name);
    if (entry && !entry.isDirectory) {
      const blob = await repository.getBlob(entry.oid);
      if (isBinary(blob)) {
        continue;
      }
      return { name, text: new TextDecoder().decode(blob) };
    }
  }
  return undefined;
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

  const { refs, commits, readme } = state.data;
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
                name={ref.name.slice("refs/heads/".length)}
                commitOid={ref.oid}
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
                name={ref.name.slice("refs/tags/".length)}
                commitOid={ref.peeledOid ?? ref.oid}
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
      {readme && (
        <section className="readme">
          <h2>{readme.name}</h2>
          {readme.name.toLowerCase().endsWith(".md") ? (
            <Suspense fallback={<pre>{readme.text}</pre>}>
              <ReactMarkdown>{readme.text}</ReactMarkdown>
            </Suspense>
          ) : (
            <pre>{readme.text}</pre>
          )}
        </section>
      )}
    </div>
  );
}
