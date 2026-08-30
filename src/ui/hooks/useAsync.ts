import { useEffect, useMemo, useState } from "react";

export type AsyncState<T> =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly error: unknown }
  | { readonly status: "success"; readonly data: T };

interface Completed<T> {
  readonly token: unknown;
  readonly result: AsyncState<T>;
}

/**
 * Runs `factory` whenever `deps` changes, tracking loading/error/success
 * state. Stale results (from a superseded run) are discarded.
 *
 * "Loading" is derived during render by comparing a fresh per-deps `token`
 * against the token of the last *completed* run, rather than being set
 * synchronously inside the effect -- setState inside an effect body should
 * only happen in an async continuation (here, a `.then` callback), not as
 * the effect's first synchronous act.
 */
export function useAsync<T>(
  factory: () => Promise<T>,
  deps: readonly unknown[],
): AsyncState<T> {
  // eslint-disable-next-line react-hooks/use-memo, react-hooks/exhaustive-deps -- `deps` is the caller-controlled dependency list by design
  const token = useMemo(() => ({}), deps);
  const [completed, setCompleted] = useState<Completed<T> | undefined>();

  useEffect(() => {
    let cancelled = false;
    factory().then(
      (data) => {
        if (!cancelled) {
          setCompleted({ token, result: { status: "success", data } });
        }
      },
      (error: unknown) => {
        if (!cancelled) {
          setCompleted({ token, result: { status: "error", error } });
        }
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `token` alone identifies this run; `factory` is expected to close over the same inputs that produced it
  }, [token]);

  if (completed?.token !== token) {
    return { status: "loading" };
  }
  return completed.result;
}
