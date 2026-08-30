export function LoadingPanel({
  label = "Loading…",
}: {
  readonly label?: string;
}) {
  return (
    <div className="panel panel-loading" role="status">
      {label}
    </div>
  );
}
