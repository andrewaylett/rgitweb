/**
 * A small helper for the (rare, `noUncheckedIndexedAccess`-driven) places
 * where we know an index is in bounds but TypeScript doesn't: throws with a
 * useful message instead of a silent non-null assertion.
 */
export function definite<T>(value: T | undefined, message: string): T {
  if (value === undefined) {
    throw new Error(message);
  }
  return value;
}
