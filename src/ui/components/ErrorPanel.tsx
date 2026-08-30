import { NotFoundError, RepositoryAccessError } from "../../git/index.js";

export function ErrorPanel({ error }: { readonly error: unknown }) {
  if (error instanceof RepositoryAccessError) {
    return (
      <div className="panel panel-error" role="alert">
        <h2>Can&apos;t reach that repository</h2>
        <p>{error.hint}</p>
      </div>
    );
  }
  if (error instanceof NotFoundError) {
    return (
      <div className="panel panel-error" role="alert">
        <h2>Not found</h2>
        <p>{error.message}</p>
      </div>
    );
  }
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="panel panel-error" role="alert">
      <h2>Something went wrong</h2>
      <p>{message}</p>
      <p className="hint">Check the browser console for details.</p>
    </div>
  );
}
