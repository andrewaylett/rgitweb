import { Link, useParams } from "react-router";

import {
  NotFoundError,
  type Repository,
  type TreeEntry,
} from "../../git/index.js";
import { Breadcrumbs } from "../components/Breadcrumbs.js";
import { ErrorPanel } from "../components/ErrorPanel.js";
import { LoadingPanel } from "../components/LoadingPanel.js";
import { OidLink } from "../components/OidLink.js";
import { Readme } from "../components/Readme.js";
import { useAsync } from "../hooks/useAsync.js";
import { useDocumentTitle } from "../hooks/useDocumentTitle.js";
import {
  blobPath,
  decodeSplatPath,
  repoDisplayName,
  treePath,
} from "../paths.js";
import { useRepo } from "../repoOutletContext.js";
import { shortOid, summaryLine } from "../utils/format.js";
import { resolveCommitOid } from "../utils/resolveCommit.js";

interface TreeEntryWithTarget extends TreeEntry {
  readonly symlinkTarget?: string;
}

interface TreeData {
  readonly commitOid: string;
  readonly commitMessage: string;
  readonly treeOid: string;
  readonly entries: readonly TreeEntryWithTarget[];
}

async function loadTree(
  repository: Repository,
  rev: string,
  path: string,
): Promise<TreeData> {
  const commitOid = await resolveCommitOid(repository, rev);
  const commit = await repository.getCommit(commitOid);
  const entry = await repository.pathEntry(commitOid, path);
  if (!entry) {
    throw new NotFoundError(`"${path || "/"}" does not exist at ${rev}`);
  }
  if (!entry.isDirectory) {
    throw new NotFoundError(`"${path}" is not a directory at ${rev}`);
  }
  const entries = await repository.getTree(entry.oid);
  const withTargets = await Promise.all(
    entries.map(async (child): Promise<TreeEntryWithTarget> => {
      if (!child.isSymlink) {
        return child;
      }
      const blob = await repository.getBlob(child.oid);
      return { ...child, symlinkTarget: new TextDecoder().decode(blob) };
    }),
  );
  return {
    commitOid,
    commitMessage: commit.message,
    treeOid: entry.oid,
    entries: sortEntries(withTargets),
  };
}

function sortEntries(
  entries: readonly TreeEntryWithTarget[],
): TreeEntryWithTarget[] {
  return entries.toSorted((a, b) => {
    if (a.isDirectory !== b.isDirectory) {
      return a.isDirectory ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

export function TreePage() {
  const { repository, url } = useRepo();
  const { ref: routeRev, "*": splat } = useParams<{
    ref: string;
    "*": string;
  }>();
  const rev = routeRev ?? "";
  const path = decodeSplatPath(splat);

  useDocumentTitle(`${repoDisplayName(url)} — tree: ${path || "/"}`);

  const state = useAsync(
    () => loadTree(repository, rev, path),
    [repository, rev, path],
  );

  if (state.status === "loading") {
    return <LoadingPanel />;
  }
  if (state.status === "error") {
    return <ErrorPanel error={state.error} />;
  }

  return (
    <div>
      {path && <Breadcrumbs repoUrl={url} rev={rev} path={path} />}
      <p className="summary">
        <OidLink repoUrl={url} oid={state.data.commitOid} />{" "}
        {summaryLine(state.data.commitMessage)}
      </p>
      <table className="tree-table">
        <thead>
          <tr>
            <th>mode</th>
            <th>name</th>
          </tr>
        </thead>
        <tbody>
          {state.data.entries.map((entry) => (
            <TreeRow
              key={entry.name}
              repoUrl={url}
              rev={rev}
              path={path}
              entry={entry}
            />
          ))}
        </tbody>
      </table>
      {state.data.entries.length === 0 && <p>Empty directory.</p>}
      <Readme repository={repository} treeOid={state.data.treeOid} />
    </div>
  );
}

function TreeRow({
  repoUrl,
  rev,
  path,
  entry,
}: {
  readonly repoUrl: string;
  readonly rev: string;
  readonly path: string;
  readonly entry: TreeEntryWithTarget;
}) {
  const childPath = path ? `${path}/${entry.name}` : entry.name;

  if (entry.isSubmodule) {
    return (
      <tr>
        <td className="mode">{entry.mode}</td>
        <td>
          {entry.name}{" "}
          <span className="hint">submodule @ {shortOid(entry.oid)}</span>
        </td>
      </tr>
    );
  }
  if (entry.isSymlink) {
    return (
      <tr>
        <td className="mode">{entry.mode}</td>
        <td>
          {entry.name} <span className="hint">→ {entry.symlinkTarget}</span>
        </td>
      </tr>
    );
  }
  return (
    <tr>
      <td className="mode">{entry.mode}</td>
      <td>
        <Link
          to={
            entry.isDirectory
              ? treePath(repoUrl, rev, childPath)
              : blobPath(repoUrl, rev, childPath)
          }
        >
          {entry.name}
          {entry.isDirectory ? "/" : ""}
        </Link>
      </td>
    </tr>
  );
}
