/**
 * Parsing of `HEAD`, `info/refs`, and `objects/info/packs` — the small
 * plain-text files `git update-server-info` maintains for dumb-HTTP clients.
 */

import { type Head, NotFoundError, type Oid, type Ref } from "./types.js";
import { type Transport } from "./transport.js";

const OID_RE = /^[0-9a-f]{40}$/;

interface MutableRef {
  name: string;
  oid: Oid;
  peeledOid?: Oid;
}

/** Parse `info/refs`, folding `<ref>^{}` peeled lines into `peeledOid`. */
export async function fetchInfoRefs(
  transport: Transport,
  baseUrl: string,
): Promise<Ref[]> {
  const text = await transport.fetchText(`${baseUrl}/info/refs`);
  const refs: MutableRef[] = [];
  const byName = new Map<string, MutableRef>();

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trimEnd();
    if (line.length === 0) {
      continue;
    }
    const tab = line.indexOf("\t");
    if (tab === -1) {
      continue;
    }
    const oid = line.slice(0, tab);
    const name = line.slice(tab + 1);
    if (!OID_RE.test(oid)) {
      continue;
    }
    if (name.endsWith("^{}")) {
      const target = byName.get(name.slice(0, -3));
      if (target) {
        target.peeledOid = oid;
      }
      continue;
    }
    const ref: MutableRef = { name, oid };
    refs.push(ref);
    byName.set(name, ref);
  }

  return refs;
}

/** Parse `HEAD`, which is either `ref: refs/heads/x` or a bare oid. */
export async function fetchHead(
  transport: Transport,
  baseUrl: string,
  refs: readonly Ref[],
): Promise<Head> {
  const text = (await transport.fetchText(`${baseUrl}/HEAD`)).trim();

  const symbolic = /^ref:\s*(\S+)$/.exec(text);
  if (symbolic) {
    const symref = symbolic[1];
    if (symref === undefined) {
      throw new Error(`Malformed HEAD contents: ${text}`);
    }
    const target = refs.find((r) => r.name === symref);
    if (!target) {
      throw new NotFoundError(`HEAD points to missing ref ${symref}`);
    }
    return { symref, oid: target.oid };
  }

  if (OID_RE.test(text)) {
    return { oid: text };
  }

  throw new Error(`Malformed HEAD contents: ${text}`);
}

/**
 * Parse `objects/info/packs` (lines `P pack-<sha>.pack`). Returns the pack
 * basenames without the `.pack` extension. A missing file means a loose-only
 * repository: tolerated as an empty list, not an error.
 */
export async function fetchPackList(
  transport: Transport,
  baseUrl: string,
): Promise<string[]> {
  let text: string;
  try {
    text = await transport.fetchText(`${baseUrl}/objects/info/packs`);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return [];
    }
    throw error;
  }

  const packs: string[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith("P ")) {
      continue;
    }
    const name = line.slice(2).trim();
    if (name.endsWith(".pack")) {
      packs.push(name.slice(0, -".pack".length));
    }
  }
  return packs;
}

/**
 * Resolve a full oid, full ref name, or shorthand to an oid, trying
 * candidates in git's usual order.
 */
export function resolveRefName(
  refs: readonly Ref[],
  head: Head,
  refOrOid: string,
): Oid {
  const lower = refOrOid.toLowerCase();
  if (OID_RE.test(lower)) {
    return lower;
  }

  if (refOrOid === "HEAD") {
    return head.oid;
  }

  const candidates = [
    refOrOid,
    `refs/${refOrOid}`,
    `refs/tags/${refOrOid}`,
    `refs/heads/${refOrOid}`,
    `refs/remotes/${refOrOid}`,
  ];
  for (const candidate of candidates) {
    const match = refs.find((r) => r.name === candidate);
    if (match) {
      return match.oid;
    }
  }

  throw new NotFoundError(`Cannot resolve ref or oid: ${refOrOid}`);
}
