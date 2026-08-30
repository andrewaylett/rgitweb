import { Link } from "react-router-dom";

import { commitPath } from "../paths.js";
import { shortOid } from "../utils/format.js";

export function OidLink({
  repoUrl,
  oid,
}: {
  readonly repoUrl: string;
  readonly oid: string;
}) {
  return (
    <Link to={commitPath(repoUrl, oid)} className="oid">
      {shortOid(oid)}
    </Link>
  );
}
