import { useEffect, useState, type SyntheticEvent } from "react";

import { structuredPatch } from "diff";

import { isBinary } from "../utils/binary.js";
import { type Repository } from "../../git/index.js";
import { type FileChange } from "../utils/treeDiff.js";

const MAX_RENDERED_LINES = 400;

interface ComputedDiff {
  readonly binary: boolean;
  readonly hunks: readonly {
    readonly header: string;
    readonly lines: readonly string[];
  }[];
  readonly totalLines: number;
  readonly truncated: boolean;
}

async function computeDiff(
  repository: Repository,
  change: FileChange,
): Promise<ComputedDiff> {
  if (change.isSubmodule) {
    return { binary: false, hunks: [], totalLines: 0, truncated: false };
  }
  const [oldBytes, newBytes] = await Promise.all([
    change.oldOid
      ? repository.getBlob(change.oldOid)
      : Promise.resolve(new Uint8Array(0)),
    change.newOid
      ? repository.getBlob(change.newOid)
      : Promise.resolve(new Uint8Array(0)),
  ]);
  if (
    (change.oldOid && isBinary(oldBytes)) ||
    (change.newOid && isBinary(newBytes))
  ) {
    return { binary: true, hunks: [], totalLines: 0, truncated: false };
  }
  const decoder = new TextDecoder();
  const patch = structuredPatch(
    change.path,
    change.path,
    decoder.decode(oldBytes),
    decoder.decode(newBytes),
  );
  let total = 0;
  let truncated = false;
  const hunks: { header: string; lines: string[] }[] = [];
  for (const hunk of patch.hunks) {
    const header = `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`;
    const lines: string[] = [];
    for (const line of hunk.lines) {
      if (total >= MAX_RENDERED_LINES) {
        truncated = true;
        break;
      }
      lines.push(line);
      total++;
    }
    hunks.push({ header, lines });
    if (truncated) {
      break;
    }
  }
  return { binary: false, hunks, totalLines: total, truncated };
}

function statusLabel(change: FileChange): string {
  switch (change.status) {
    case "added": {
      return "added";
    }
    case "removed": {
      return "removed";
    }
    case "modified": {
      return "modified";
    }
  }
}

export function FileDiff({
  repository,
  change,
  defaultOpen,
}: {
  readonly repository: Repository;
  readonly change: FileChange;
  readonly defaultOpen: boolean;
}) {
  const [opened, setOpened] = useState(defaultOpen);
  // `undefined` doubles as "loading": the fetch hasn't completed yet, so
  // there's nothing to set synchronously when the effect starts -- setState
  // only happens in the async `.then` continuations below.
  const [diff, setDiff] = useState<ComputedDiff | "error" | undefined>();

  useEffect(() => {
    if (!opened || diff !== undefined) {
      return;
    }
    let cancelled = false;
    computeDiff(repository, change).then(
      (result) => {
        if (!cancelled) {
          setDiff(result);
        }
      },
      () => {
        if (!cancelled) {
          setDiff("error");
        }
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  const handleToggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
    setOpened(event.currentTarget.open);
  };

  return (
    <details className="file-diff" open={opened} onToggle={handleToggle}>
      <summary>
        <span className={`change-status change-${change.status}`}>
          {statusLabel(change)}
        </span>
        <span className="path">{change.path}</span>
        {change.isSubmodule && <span className="hint"> (submodule)</span>}
      </summary>
      {opened && (
        <div className="file-diff-body">
          {change.isSubmodule ? (
            <p className="hint">
              submodule pointer: {change.oldOid ?? "(none)"} →{" "}
              {change.newOid ?? "(none)"}
            </p>
          ) : diff === undefined ? (
            <p className="hint">Loading diff…</p>
          ) : diff === "error" ? (
            <p className="error-inline">Failed to load diff.</p>
          ) : diff.binary ? (
            <p className="hint">Binary files differ.</p>
          ) : diff.hunks.length === 0 ? (
            <p className="hint">No textual changes (mode change only).</p>
          ) : (
            <>
              <pre className="diff">
                {diff.hunks.map((hunk, index) => (
                  <div key={index}>
                    <div className="diff-hunk-header">{hunk.header}</div>
                    {hunk.lines.map((line, lineIndex) => (
                      <div key={lineIndex} className={diffLineClass(line)}>
                        {line}
                      </div>
                    ))}
                  </div>
                ))}
              </pre>
              {diff.truncated && (
                <p className="hint">
                  Diff truncated at {MAX_RENDERED_LINES} lines.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </details>
  );
}

function diffLineClass(line: string): string {
  if (line.startsWith("+")) {
    return "diff-add";
  }
  if (line.startsWith("-")) {
    return "diff-remove";
  }
  return "diff-context";
}
