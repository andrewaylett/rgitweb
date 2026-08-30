/** Parsing of commit, tree, and annotated tag object payloads. */

import { bytesToHex } from "./hex.js";
import {
  type AnnotatedTag,
  type Commit,
  type ObjectType,
  type Oid,
  type Person,
  type TreeEntry,
} from "./types.js";

const PERSON_RE = /^(.*) <([^>]*)> (\d+) ([+-]\d{4})$/;

function parsePerson(value: string): Person {
  const match = PERSON_RE.exec(value);
  if (!match) {
    throw new Error(`Malformed person line: "${value}"`);
  }
  const [, name, email, seconds, tzOffset] = match;
  if (
    name === undefined ||
    email === undefined ||
    seconds === undefined ||
    tzOffset === undefined
  ) {
    throw new Error(`Malformed person line: "${value}"`);
  }
  return {
    name,
    email,
    date: new Date(Number(seconds) * 1000),
    tzOffset,
  };
}

/** Splits a commit/tag payload into its header block and trailing message. */
function splitHeaderAndMessage(text: string): {
  header: string;
  message: string;
} {
  const sep = text.indexOf("\n\n");
  if (sep === -1) {
    return { header: text, message: "" };
  }
  return { header: text.slice(0, sep), message: text.slice(sep + 2) };
}

/** Parses header lines, folding ` `-prefixed continuation lines (e.g. gpgsig) in. */
function parseHeaderLines(header: string): { key: string; value: string }[] {
  const result: { key: string; value: string }[] = [];
  for (const line of header.split("\n")) {
    if (line.startsWith(" ") && result.length > 0) {
      const last = result.at(-1) as { key: string; value: string };
      last.value += "\n" + line.slice(1);
      continue;
    }
    const sp = line.indexOf(" ");
    if (sp === -1) {
      continue;
    }
    result.push({ key: line.slice(0, sp), value: line.slice(sp + 1) });
  }
  return result;
}

export function parseCommit(oid: Oid, data: Uint8Array): Commit {
  const text = new TextDecoder("utf-8").decode(data);
  const { header, message } = splitHeaderAndMessage(text);
  const headers = parseHeaderLines(header);

  let tree: string | undefined;
  const parents: Oid[] = [];
  let author: Person | undefined;
  let committer: Person | undefined;

  for (const { key, value } of headers) {
    switch (key) {
      case "tree": {
        tree = value;
        break;
      }
      case "parent": {
        parents.push(value);
        break;
      }
      case "author": {
        author = parsePerson(value);
        break;
      }
      case "committer": {
        committer = parsePerson(value);
        break;
      }
      default: {
        break;
      }
    }
  }

  if (tree === undefined || author === undefined || committer === undefined) {
    throw new Error(`Malformed commit ${oid}: missing tree/author/committer`);
  }

  return { oid, tree, parents, author, committer, message };
}

export function parseTree(oid: Oid, data: Uint8Array): TreeEntry[] {
  const decoder = new TextDecoder("utf-8");
  const entries: TreeEntry[] = [];
  let pos = 0;

  while (pos < data.length) {
    const spaceIdx = data.indexOf(0x20, pos);
    if (spaceIdx === -1) {
      throw new Error(`Malformed tree ${oid}: missing mode separator`);
    }
    const mode = decoder.decode(data.subarray(pos, spaceIdx));

    const nulIdx = data.indexOf(0, spaceIdx + 1);
    if (nulIdx === -1) {
      throw new Error(`Malformed tree ${oid}: missing name terminator`);
    }
    const name = decoder.decode(data.subarray(spaceIdx + 1, nulIdx));

    const oidStart = nulIdx + 1;
    const oidEnd = oidStart + 20;
    if (oidEnd > data.length) {
      throw new Error(`Malformed tree ${oid}: truncated entry oid`);
    }
    const entryOid = bytesToHex(data.subarray(oidStart, oidEnd));

    entries.push({
      mode,
      name,
      oid: entryOid,
      isDirectory: mode === "40000",
      isSymlink: mode === "120000",
      isSubmodule: mode === "160000",
    });

    pos = oidEnd;
  }

  return entries;
}

export function parseTag(oid: Oid, data: Uint8Array): AnnotatedTag {
  const text = new TextDecoder("utf-8").decode(data);
  const { header, message } = splitHeaderAndMessage(text);
  const headers = parseHeaderLines(header);

  let targetOid: string | undefined;
  let targetType: ObjectType | undefined;
  let name: string | undefined;
  let tagger: Person | undefined;

  for (const { key, value } of headers) {
    switch (key) {
      case "object": {
        targetOid = value;
        break;
      }
      case "type": {
        targetType = value as ObjectType;
        break;
      }
      case "tag": {
        name = value;
        break;
      }
      case "tagger": {
        tagger = parsePerson(value);
        break;
      }
      default: {
        break;
      }
    }
  }

  if (
    targetOid === undefined ||
    targetType === undefined ||
    name === undefined
  ) {
    throw new Error(`Malformed tag ${oid}: missing object/type/tag`);
  }

  return { oid, targetOid, targetType, name, tagger, message };
}

/** Verifies fetched object content against its expected oid via SHA-1. */
export async function verifyOid(
  oid: Oid,
  type: ObjectType,
  data: Uint8Array,
): Promise<void> {
  const header = new TextEncoder().encode(`${type} ${data.length}\0`);
  const full = new Uint8Array(header.length + data.length);
  full.set(header, 0);
  full.set(data, header.length);
  const digest = await crypto.subtle.digest("SHA-1", full);
  const computed = bytesToHex(new Uint8Array(digest));
  if (computed !== oid) {
    throw new Error(
      `Object content does not match its oid: expected ${oid}, computed ${computed}`,
    );
  }
}
