/** Same heuristic git itself uses: a NUL byte in the first chunk means binary. */
export function isBinary(data: Uint8Array): boolean {
  const scanLength = Math.min(data.length, 8000);
  for (let i = 0; i < scanLength; i++) {
    if (data[i] === 0) {
      return true;
    }
  }
  return false;
}
