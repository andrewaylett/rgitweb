import { Link, useParams } from "react-router-dom";

import {
  NotFoundError,
  type Repository,
  type TreeEntry,
} from "../../git/index.js";
import { Breadcrumbs } from "../components/Breadcrumbs.js";
import { ErrorPanel } from "../components/ErrorPanel.js";
import { LoadingPanel } from "../components/LoadingPanel.js";
import { useAsync } from "../hooks/useAsync.js";
import { useDocumentTitle } from "../hooks/useDocumentTitle.js";
import {
  blobPath,
  decodeSplatPath,
  repoDisplayName,
  treePath,
} from "../paths.js";
import { useRepo } from "../repoOutletContext.js";
import { shortOid } from "../utils/format.js";
import { resolveCommitOid } from "../utils/resolveCommit.js";

interface TreeEntryWithTarget extends TreeEntry {
  readonly symlinkTarget?: string;
}

async function loadTree(
  repository: Repository,
  rev: string,
  path: string,
): Promise<readonly TreeEntryWithTarget[]> {
  const commitOid = await resolveCommitOid(repository, rev);
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
  return sortEntries(withTargets);
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
      <Breadcrumbs repoUrl={url} rev={rev} path={path} />
      <table className="tree-table">
        <thead>
          <tr>
            <th>mode</th>
            <th>name</th>
          </tr>
        </thead>
        <tbody>
          {state.data.map((entry) => (
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
      {state.data.length === 0 && <p>Empty directory.</p>}
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
