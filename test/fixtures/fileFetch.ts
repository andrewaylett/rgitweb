/**
 * A `fetch` look-alike that serves a directory off disk, for exercising the
 * git data layer against the real fixture repo without a network.
 *
 * `createFileFetch` honours Range requests (206 + Content-Range, or 416 for
 * an out-of-bounds range) the way a real static file server would.
 * `createNoRangeFileFetch` always returns 200 with the full body, to
 * exercise the transport's range-less fallback path.
 */

import { readFileSync, statSync } from "node:fs";
import { join, normalize, relative } from "node:path";

/** Extracts the request URL as a string, without relying on `Request`'s
 * default (unhelpful) `toString()`. */
export function requestUrl(input: string | URL | Request): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof Request) {
    return input.url;
  }
  return input.href;
}

function resolveUrlToPath(root: string, url: string): string {
  const u = new URL(url);
  const decodedPath = decodeURIComponent(u.pathname);
  const full = normalize(join(root, decodedPath));
  const rel = relative(root, full);
  if (rel.startsWith("..")) {
    throw new Error(`Path escapes fixture root: ${url}`);
  }
  return full;
}

function readFileOrNull(path: string): Uint8Array | undefined {
  try {
    const stat = statSync(path);
    if (!stat.isFile()) {
      return undefined;
    }
    return new Uint8Array(readFileSync(path));
  } catch {
    return undefined;
  }
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  return buf;
}

/** A fetch backed by files under `root`, with real Range support. */
export function createFileFetch(root: string): typeof globalThis.fetch {
  const fetchImpl = (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = requestUrl(input);
    const path = resolveUrlToPath(root, url);
    const content = readFileOrNull(path);
    if (!content) {
      return Promise.resolve(
        new Response(null, { status: 404, statusText: "Not Found" }),
      );
    }

    const headers =
      init?.headers instanceof Headers
        ? init.headers
        : new Headers(init?.headers);
    const rangeHeader = headers.get("Range");

    if (!rangeHeader) {
      return Promise.resolve(
        new Response(toArrayBuffer(content), {
          status: 200,
          headers: { "Content-Length": String(content.length) },
        }),
      );
    }

    const match = /^bytes=(\d+)-(\d+)$/.exec(rangeHeader);
    if (!match) {
      return Promise.resolve(
        new Response(toArrayBuffer(content), { status: 200 }),
      );
    }
    const start = Number(match[1]);
    const requestedEnd = Number(match[2]);
    if (start >= content.length) {
      return Promise.resolve(
        new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${content.length}` },
        }),
      );
    }
    const end = Math.min(requestedEnd, content.length - 1);
    const slice = content.subarray(start, end + 1);
    return Promise.resolve(
      new Response(toArrayBuffer(slice), {
        status: 206,
        headers: {
          "Content-Range": `bytes ${start}-${end}/${content.length}`,
          "Content-Length": String(slice.length),
        },
      }),
    );
  };
  return fetchImpl;
}

/** A fetch backed by files under `root` that ignores Range and always
 * returns the full body with 200, to exercise the fallback path. */
export function createNoRangeFileFetch(root: string): typeof globalThis.fetch {
  const fetchImpl = (input: string | URL | Request): Promise<Response> => {
    const url = requestUrl(input);
    const path = resolveUrlToPath(root, url);
    const content = readFileOrNull(path);
    if (!content) {
      return Promise.resolve(
        new Response(null, { status: 404, statusText: "Not Found" }),
      );
    }
    return Promise.resolve(
      new Response(toArrayBuffer(content), {
        status: 200,
        headers: { "Content-Length": String(content.length) },
      }),
    );
  };
  return fetchImpl;
}
