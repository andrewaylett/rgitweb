/**
 * HTTP access layer for dumb-HTTP git repositories.
 *
 * All functions take an injected `fetch` (see `OpenOptions.fetch`) so tests
 * can serve fixtures from disk. No cache-busting headers are ever sent: the
 * browser's HTTP cache is what makes repeated range reads of immutable pack
 * data cheap.
 */

import { NotFoundError } from "./types.js";

export type FetchFn = typeof globalThis.fetch;

export interface Transport {
  fetchText(url: string): Promise<string>;
  fetchBinary(url: string): Promise<Uint8Array>;
  /**
   * Fetch `length` bytes starting at `start`. If the server does not honour
   * Range requests (responds 200 with the full body instead of 206), the
   * full body is cached in memory per-URL so subsequent range reads of the
   * same URL are served without another network round trip.
   */
  fetchRange(url: string, start: number, length: number): Promise<Uint8Array>;
}

/** Thrown when a fetch throws (network/CORS failure) rather than resolving. */
export class TransportError extends Error {
  constructor(
    message: string,
    readonly transportCause: unknown,
  ) {
    super(message);
  }
}

export function createTransport(fetchImpl: FetchFn): Transport {
  // URLs for which the server has been observed to ignore Range headers.
  const noRangeSupport = new Set<string>();
  // Full-body cache for URLs known not to support ranges.
  const fullBodyCache = new Map<string, Uint8Array>();

  async function doFetch(url: string, init?: RequestInit): Promise<Response> {
    try {
      return await fetchImpl(url, init);
    } catch (error) {
      throw new TransportError(`Network error fetching ${url}`, error);
    }
  }

  async function fetchWholeBody(url: string): Promise<Uint8Array> {
    const cached = fullBodyCache.get(url);
    if (cached) {
      return cached;
    }
    const response = await doFetch(url);
    if (response.status === 404) {
      throw new NotFoundError(`Not found: ${url}`);
    }
    if (!response.ok) {
      throw new Error(`Unexpected status ${response.status} fetching ${url}`);
    }
    const buf = new Uint8Array(await response.arrayBuffer());
    return buf;
  }

  async function fetchText(url: string): Promise<string> {
    const bytes = await fetchWholeBody(url);
    return new TextDecoder("utf-8").decode(bytes);
  }

  async function fetchBinary(url: string): Promise<Uint8Array> {
    return fetchWholeBody(url);
  }

  async function fetchRange(
    url: string,
    start: number,
    length: number,
  ): Promise<Uint8Array> {
    if (noRangeSupport.has(url)) {
      const full = await fetchWholeBody(url);
      return full.subarray(start, start + length);
    }

    const end = start + length - 1;
    const response = await doFetch(url, {
      headers: { Range: `bytes=${start}-${end}` },
    });

    if (response.status === 404) {
      throw new NotFoundError(`Not found: ${url}`);
    }

    if (response.status === 416) {
      // Requested range not satisfiable: nothing left to read at this
      // offset.
      return new Uint8Array(0);
    }

    if (response.status === 206) {
      return new Uint8Array(await response.arrayBuffer());
    }

    if (response.ok) {
      // Server ignored our Range header and sent the whole file: remember
      // that for next time, and cache the body so we don't refetch it.
      noRangeSupport.add(url);
      const full = new Uint8Array(await response.arrayBuffer());
      fullBodyCache.set(url, full);
      return full.subarray(start, start + length);
    }

    throw new Error(`Unexpected status ${response.status} fetching ${url}`);
  }

  return { fetchText, fetchBinary, fetchRange };
}
