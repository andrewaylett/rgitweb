/**
 * zlib inflation helpers built on pako.
 *
 * Loose objects are small and fetched whole, so they can be inflated in one
 * shot. Pack entries are read via HTTP Range requests of unknown compressed
 * length, so we feed pako incrementally and ask for more bytes only when the
 * decompressor hasn't yet reached the end of the zlib stream.
 */

import * as pako from "pako";

/** Inflate a complete zlib buffer (used for loose objects). */
export function inflateAll(data: Uint8Array): Uint8Array {
  return pako.inflate(data);
}

/**
 * Incrementally inflate a zlib stream of unknown compressed length.
 *
 * `readMore(offset)` is called with the absolute byte offset (from the start
 * of the compressed stream) of the next bytes needed, and must resolve to
 * the next chunk of compressed bytes, or `null`/empty when no more data is
 * available. It is expected to over-fetch a reasonable amount so this isn't
 * called once per byte.
 */
export async function inflateStream(
  readMore: (offset: number) => Promise<Uint8Array | null>,
): Promise<Uint8Array> {
  const inflator = new pako.Inflate();
  let offset = 0;

  while (!inflator.ended) {
    const chunk = await readMore(offset);
    if (!chunk || chunk.length === 0) {
      break;
    }
    offset += chunk.length;
    inflator.push(chunk, false);
  }

  if (!inflator.ended) {
    throw new Error("Unexpected end of compressed stream");
  }
  if (inflator.err) {
    throw new Error(`Inflate failed: ${inflator.msg || String(inflator.err)}`);
  }

  const result = inflator.result;
  if (typeof result === "string") {
    // We never pass { to: 'string' }, so this cannot happen; guard for the
    // type checker only.
    throw new TypeError("Unexpected string inflate result");
  }
  return result;
}
