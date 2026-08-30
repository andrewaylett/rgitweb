import { Link, NavLink, Outlet, useParams } from "react-router-dom";

import { ErrorPanel } from "../components/ErrorPanel.js";
import { LoadingPanel } from "../components/LoadingPanel.js";
import { useAsync } from "../hooks/useAsync.js";
import {
  logPath,
  refsPath,
  repoDisplayName,
  summaryPath,
  treePath,
} from "../paths.js";
import { getRepository } from "../repoCache.js";
import { addRecentRepo } from "../utils/recentRepos.js";
import { type RepoOutletContext } from "../repoOutletContext.js";

function defaultRevFromHead(
  headSymref: string | undefined,
  headOid: string,
): string {
  if (headSymref?.startsWith("refs/heads/")) {
    return headSymref.slice("refs/heads/".length);
  }
  return headOid;
}

export function RepoLayout() {
  const { repoUrl: encodedRepoUrl } = useParams<{ repoUrl: string }>();
  // React Router already fully decodes matched path params, including
  // literal slashes that were percent-encoded to keep the URL to one segment.
  const repoUrl = encodedRepoUrl ?? "";

  const state = useAsync(async () => {
    const repository = await getRepository(repoUrl);
    const head = await repository.head();
    addRecentRepo(repoUrl);
    return {
      repository,
      defaultRev: defaultRevFromHead(head.symref, head.oid),
    };
  }, [repoUrl]);

  if (state.status === "loading") {
    return (
      <div className="page">
        <LoadingPanel label="Opening repository…" />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="page">
        <p>
          <Link to="/">← back</Link>
        </p>
        <ErrorPanel error={state.error} />
      </div>
    );
  }

  const context: RepoOutletContext = {
    repository: state.data.repository,
    url: repoUrl,
    defaultRev: state.data.defaultRev,
  };

  return (
    <div className="page repo-page">
      <header className="repo-header">
        <h1>
          <Link to={summaryPath(repoUrl)}>{repoDisplayName(repoUrl)}</Link>
        </h1>
        <p className="repo-url">{repoUrl}</p>
        <nav className="tabs">
          <NavLink to={summaryPath(repoUrl)} end>
            summary
          </NavLink>
          <NavLink to={refsPath(repoUrl)}>refs</NavLink>
          <NavLink to={logPath(repoUrl, context.defaultRev)}>log</NavLink>
          <NavLink to={treePath(repoUrl, context.defaultRev)}>tree</NavLink>
        </nav>
      </header>
      <main>
        <Outlet context={context} />
      </main>
    </div>
  );
}
