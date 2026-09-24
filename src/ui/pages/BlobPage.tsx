import { lazy, Suspense, useEffect, useMemo, useState } from "react";

import { useParams } from "react-router";

import { NotFoundError, type Repository } from "../../git/index.js";
import { Breadcrumbs } from "../components/Breadcrumbs.js";
import { ErrorPanel } from "../components/ErrorPanel.js";
import { HighlightedCode } from "../components/HighlightedCode.js";
import { LoadingPanel } from "../components/LoadingPanel.js";
import { useAsync } from "../hooks/useAsync.js";
import { useDocumentTitle } from "../hooks/useDocumentTitle.js";
import { decodeSplatPath, repoDisplayName } from "../paths.js";
import { useRepo } from "../repoOutletContext.js";
import { isBinary } from "../utils/binary.js";
import { formatBytes } from "../utils/format.js";
import { isMarkdown } from "../utils/languageMap.js";
import { resolveCommitOid } from "../utils/resolveCommit.js";

const ReactMarkdown = lazy(() => import("react-markdown"));

interface BlobData {
  readonly path: string;
  readonly bytes: Uint8Array;
}

async function loadBlob(
  repository: Repository,
  rev: string,
  path: string,
): Promise<BlobData> {
  const commitOid = await resolveCommitOid(repository, rev);
  const entry = await repository.pathEntry(commitOid, path);
  if (!entry) {
    throw new NotFoundError(`"${path}" does not exist at ${rev}`);
  }
  if (entry.isDirectory) {
    throw new NotFoundError(`"${path}" is a directory, not a file`);
  }
  const bytes = await repository.getBlob(entry.oid);
  return { path, bytes };
}

function useObjectUrl(bytes: Uint8Array | undefined): string | undefined {
  return useMemo(() => {
    if (!bytes) {
      return;
    }
    return URL.createObjectURL(new Blob([new Uint8Array(bytes)]));
  }, [bytes]);
}

export function BlobPage() {
  const { repository, url } = useRepo();
  const { ref: routeRev, "*": splat } = useParams<{
    ref: string;
    "*": string;
  }>();
  const rev = routeRev ?? "";
  const path = decodeSplatPath(splat);
  const filename = path.split("/").pop() ?? path;

  useDocumentTitle(`${repoDisplayName(url)} — ${filename}`);

  const state = useAsync(
    () => loadBlob(repository, rev, path),
    [repository, rev, path],
  );
  const [showRendered, setShowRendered] = useState(true);

  const bytes = state.status === "success" ? state.data.bytes : undefined;
  const objectUrl = useObjectUrl(bytes);
  useEffect(() => {
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [objectUrl]);

  if (state.status === "loading") {
    return <LoadingPanel />;
  }
  if (state.status === "error") {
    return <ErrorPanel error={state.error} />;
  }

  const { bytes: data } = state.data;
  const binary = isBinary(data);
  const markdown = isMarkdown(filename);

  return (
    <div>
      <Breadcrumbs repoUrl={url} rev={rev} path={path} />
      <p>
        {formatBytes(data.length)}
        {objectUrl && (
          <>
            {" — "}
            <a href={objectUrl} download={filename}>
              raw
            </a>
          </>
        )}
        {markdown && !binary && (
          <>
            {" — "}
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setShowRendered((value) => !value);
              }}
            >
              {showRendered ? "view source" : "view rendered"}
            </button>
          </>
        )}
      </p>
      {binary ? (
        <p className="hint">Binary file — use the raw link to download.</p>
      ) : (
        (() => {
          const text = new TextDecoder().decode(data);
          if (markdown && showRendered) {
            return (
              <Suspense fallback={<pre>{text}</pre>}>
                <div className="readme">
                  <ReactMarkdown>{text}</ReactMarkdown>
                </div>
              </Suspense>
            );
          }
          return <HighlightedCode text={text} filename={filename} />;
        })()
      )}
    </div>
  );
}
