import { Link } from "react-router-dom";

import { treePath } from "../paths.js";

export function Breadcrumbs({
  repoUrl,
  rev,
  path,
}: {
  readonly repoUrl: string;
  readonly rev: string;
  readonly path: string;
}) {
  const segments = path.split("/").filter((segment) => segment.length > 0);
  return (
    <nav className="breadcrumbs" aria-label="Path">
      <Link to={treePath(repoUrl, rev, "")}>root</Link>
      {segments.map((segment, index) => {
        const segmentPath = segments.slice(0, index + 1).join("/");
        const isLast = index === segments.length - 1;
        return (
          <span key={segmentPath}>
            {" / "}
            {isLast ? (
              <span>{segment}</span>
            ) : (
              <Link to={treePath(repoUrl, rev, segmentPath)}>{segment}</Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
