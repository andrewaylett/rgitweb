import { lazy, Suspense } from "react";

import { useAsync } from "../hooks/useAsync.js";
import { isBinary } from "../utils/binary.js";
import { type Repository } from "../../git/index.js";

const ReactMarkdown = lazy(() => import("react-markdown"));

const README_NAMES = ["readme.md", "readme", "readme.txt"];

export async function findReadme(
  repository: Repository,
  treeOid: string,
): Promise<{ name: string; text: string } | undefined> {
  const entries = await repository.getTree(treeOid);
  for (const readmeName of README_NAMES) {
    for (const entry of entries) {
      if (!entry.isDirectory && entry.name.toLowerCase() === readmeName) {
        const blob = await repository.getBlob(entry.oid);
        if (isBinary(blob)) {
          continue;
        }
        return { name: entry.name, text: new TextDecoder().decode(blob) };
      }
    }
  }
  return undefined;
}

export function Readme({
  repository,
  treeOid,
}: {
  readonly repository: Repository;
  readonly treeOid: string;
}) {
  const state = useAsync(
    () => findReadme(repository, treeOid),
    [repository, treeOid],
  );

  if (state.status !== "success" || !state.data) {
    return null;
  }

  return (
    <section className="readme">
      <h2>{state.data.name}</h2>
      {state.data.name.toLowerCase().endsWith(".md") ? (
        <Suspense fallback={<pre>{state.data.text}</pre>}>
          <ReactMarkdown>{state.data.text}</ReactMarkdown>
        </Suspense>
      ) : (
        <pre>{state.data.text}</pre>
      )}
    </section>
  );
}
