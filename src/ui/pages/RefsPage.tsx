import { ErrorPanel } from "../components/ErrorPanel.js";
import { LoadingPanel } from "../components/LoadingPanel.js";
import { OidLink } from "../components/OidLink.js";
import { RefCommitRow } from "../components/RefCommitRow.js";
import { RelativeDate } from "../components/RelativeDate.js";
import { useAsync } from "../hooks/useAsync.js";
import { useDocumentTitle } from "../hooks/useDocumentTitle.js";
import { repoDisplayName } from "../paths.js";
import { useRepo } from "../repoOutletContext.js";
import {
  type AnnotatedTag,
  type Ref,
  type Repository,
} from "../../git/index.js";

function AnnotatedTagRow({
  repoUrl,
  tag,
}: {
  readonly repoUrl: string;
  readonly tag: AnnotatedTag;
}) {
  return (
    <tr>
      <td className="ref-name">{tag.name}</td>
      <td>
        <OidLink repoUrl={repoUrl} oid={tag.targetOid} />
      </td>
      <td className="summary">{tag.message.split("\n", 1)[0]}</td>
      <td>{tag.tagger?.name ?? "—"}</td>
      <td>{tag.tagger ? <RelativeDate date={tag.tagger.date} /> : "—"}</td>
    </tr>
  );
}

function TagRow({
  repoUrl,
  repository,
  tagRef,
}: {
  readonly repoUrl: string;
  readonly repository: Repository;
  readonly tagRef: Ref;
}) {
  const isAnnotated = tagRef.peeledOid !== undefined;
  const state = useAsync(
    async () => (isAnnotated ? repository.getTag(tagRef.oid) : undefined),
    [repository, tagRef.oid],
  );

  if (!isAnnotated) {
    return (
      <RefCommitRow
        repoUrl={repoUrl}
        repository={repository}
        name={tagRef.name.slice("refs/tags/".length)}
        commitOid={tagRef.oid}
      />
    );
  }
  if (state.status !== "success" || !state.data) {
    return (
      <tr>
        <td className="ref-name">{tagRef.name.slice("refs/tags/".length)}</td>
        <td colSpan={4}>{state.status === "error" ? "failed to load" : "…"}</td>
      </tr>
    );
  }
  return <AnnotatedTagRow repoUrl={repoUrl} tag={state.data} />;
}

export function RefsPage() {
  const { repository, url } = useRepo();
  useDocumentTitle(`${repoDisplayName(url)} — refs`);
  const state = useAsync(() => repository.refs(), [repository]);

  if (state.status === "loading") {
    return <LoadingPanel />;
  }
  if (state.status === "error") {
    return <ErrorPanel error={state.error} />;
  }

  const branches = state.data.filter((ref) =>
    ref.name.startsWith("refs/heads/"),
  );
  const tags = state.data.filter((ref) => ref.name.startsWith("refs/tags/"));

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
              <TagRow
                key={ref.name}
                repoUrl={url}
                repository={repository}
                tagRef={ref}
              />
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
