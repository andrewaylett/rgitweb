/**
 * Pack index (v2) and pack file reading over HTTP Range requests.
 *
 * See AGENTS.md / the task spec for the on-disk formats. In short: the `.idx`
 * file gives us, for any oid, a byte offset into the matching `.pack` file;
 * we then range-fetch just the bytes for that object's (possibly deltified)
 * entry, growing the fetched window on demand rather than downloading whole
 * packs.
 */

import { definite } from "./assert.js";
import { bytesToHex, compareBytes, hexToBytes, readU32BE } from "./hex.js";
import { inflateStream } from "./inflate.js";
import { type RawObject } from "./loose.js";
import { type Transport } from "./transport.js";
import { type ObjectType, type Oid } from "./types.js";

const IDX_MAGIC = [0xff, 0x74, 0x4f, 0x63];
const FANOUT_SIZE = 256 * 4;
const IDX_HEADER_SIZE = 8 + FANOUT_SIZE;
const MAX_DELTA_DEPTH = 64;
const INITIAL_ENTRY_HEADER_SIZE = 32;
const MAX_ENTRY_HEADER_SIZE = 1024;
const PACK_READ_CHUNK = 8192;

const OBJ_COMMIT = 1;
const OBJ_TREE = 2;
const OBJ_BLOB = 3;
const OBJ_TAG = 4;
const OBJ_OFS_DELTA = 6;
const OBJ_REF_DELTA = 7;

const BASE_TYPE_NAMES: Record<number, ObjectType> = {
  [OBJ_COMMIT]: "commit",
  [OBJ_TREE]: "tree",
  [OBJ_BLOB]: "blob",
  [OBJ_TAG]: "tag",
};

export interface PackIndex {
  readonly packName: string;
  readonly idxUrl: string;
  readonly packUrl: string;
  readonly fanout: Uint32Array;
  readonly numObjects: number;
  readonly shaTableOffset: number;
  readonly offsetTableOffset: number;
  readonly bigOffsetTableOffset: number;
}

const packIndexCache = new Map<string, Promise<PackIndex>>();

export function loadPackIndex(
  transport: Transport,
  baseUrl: string,
  packName: string,
): Promise<PackIndex> {
  const idxUrl = `${baseUrl}/objects/pack/${packName}.idx`;
  const cached = packIndexCache.get(idxUrl);
  if (cached) {
    return cached;
  }
  const promise = loadPackIndexUncached(transport, baseUrl, packName, idxUrl);
  packIndexCache.set(idxUrl, promise);
  return promise;
}

async function loadPackIndexUncached(
  transport: Transport,
  baseUrl: string,
  packName: string,
  idxUrl: string,
): Promise<PackIndex> {
  const header = await transport.fetchRange(idxUrl, 0, IDX_HEADER_SIZE);
  if (header.length < IDX_HEADER_SIZE) {
    throw new Error(`Truncated pack index: ${idxUrl}`);
  }
  for (let i = 0; i < 4; i++) {
    if (header[i] !== IDX_MAGIC[i]) {
      throw new Error(`Not a pack index (bad magic): ${idxUrl}`);
    }
  }
  const version = readU32BE(header, 4);
  if (version !== 2) {
    throw new Error(`Unsupported pack index version ${version}: ${idxUrl}`);
  }

  const fanout = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    fanout[i] = readU32BE(header, 8 + i * 4);
  }
  const numObjects = definite(fanout[255], "pack index fanout table is empty");

  const shaTableOffset = IDX_HEADER_SIZE;
  const crcTableOffset = shaTableOffset + numObjects * 20;
  const offsetTableOffset = crcTableOffset + numObjects * 4;
  const bigOffsetTableOffset = offsetTableOffset + numObjects * 4;

  return {
    packName,
    idxUrl,
    packUrl: `${baseUrl}/objects/pack/${packName}.pack`,
    fanout,
    numObjects,
    shaTableOffset,
    offsetTableOffset,
    bigOffsetTableOffset,
  };
}

/** Look up an oid in a single pack index. Returns its pack offset, or undefined. */
export async function findOidOffset(
  transport: Transport,
  idx: PackIndex,
  oid: Oid,
): Promise<number | undefined> {
  const firstByte = Number.parseInt(oid.slice(0, 2), 16);
  const low =
    firstByte === 0
      ? 0
      : definite(idx.fanout[firstByte - 1], "fanout index out of range");
  const high = definite(idx.fanout[firstByte], "fanout index out of range");
  if (low >= high) {
    return undefined;
  }

  const shaSlice = await transport.fetchRange(
    idx.idxUrl,
    idx.shaTableOffset + low * 20,
    (high - low) * 20,
  );
  const target = hexToBytes(oid);

  let lo = 0;
  let hi = high - low - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const candidate = shaSlice.subarray(mid * 20, mid * 20 + 20);
    const cmp = compareBytes(candidate, target);
    if (cmp === 0) {
      found = mid;
      break;
    } else if (cmp < 0) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (found < 0) {
    return undefined;
  }

  const globalIndex = low + found;
  const offsetBytes = await transport.fetchRange(
    idx.idxUrl,
    idx.offsetTableOffset + globalIndex * 4,
    4,
  );
  const raw = readU32BE(offsetBytes, 0);
  if ((raw & 0x80_00_00_00) === 0) {
    return raw;
  }

  const bigIndex = raw & 0x7f_ff_ff_ff;
  const bigBytes = await transport.fetchRange(
    idx.idxUrl,
    idx.bigOffsetTableOffset + bigIndex * 8,
    8,
  );
  const high32 = readU32BE(bigBytes, 0);
  const low32 = readU32BE(bigBytes, 4);
  return high32 * 0x1_00_00_00_00 + low32;
}

export type ResolveObject = (oid: Oid) => Promise<RawObject>;

/** Reads and fully resolves (applying any delta chain) the object at `offset`. */
export async function readObjectAtOffset(
  transport: Transport,
  packUrl: string,
  offset: number,
  resolveRefDelta: ResolveObject,
): Promise<RawObject> {
  return readObjectAtOffsetInner(
    transport,
    packUrl,
    offset,
    resolveRefDelta,
    0,
  );
}

async function readObjectAtOffsetInner(
  transport: Transport,
  packUrl: string,
  offset: number,
  resolveRefDelta: ResolveObject,
  depth: number,
): Promise<RawObject> {
  if (depth > MAX_DELTA_DEPTH) {
    throw new Error(
      `Delta chain too deep (>${MAX_DELTA_DEPTH}) at offset ${offset}`,
    );
  }

  const entry = await readEntryHeader(transport, packUrl, offset);

  if (entry.type === OBJ_OFS_DELTA) {
    const baseOffset = definite(
      entry.ofsBase,
      `ofs-delta entry at offset ${offset} is missing its base offset`,
    );
    const base = await readObjectAtOffsetInner(
      transport,
      packUrl,
      baseOffset,
      resolveRefDelta,
      depth + 1,
    );
    const deltaBytes = await inflateEntryPayload(transport, packUrl, entry);
    const data = applyDelta(deltaBytes, base.data);
    return { type: base.type, data };
  }

  if (entry.type === OBJ_REF_DELTA) {
    const refBase = definite(
      entry.refBase,
      `ref-delta entry at offset ${offset} is missing its base oid`,
    );
    const base = await resolveRefDelta(refBase);
    const deltaBytes = await inflateEntryPayload(transport, packUrl, entry);
    const data = applyDelta(deltaBytes, base.data);
    return { type: base.type, data };
  }

  const baseType = BASE_TYPE_NAMES[entry.type];
  if (!baseType) {
    throw new Error(
      `Unknown pack object type ${entry.type} at offset ${offset}`,
    );
  }
  const data = await inflateEntryPayload(transport, packUrl, entry);
  return { type: baseType, data };
}

interface EntryHeader {
  readonly type: number;
  readonly size: number;
  readonly ofsBase?: number;
  readonly refBase?: Oid;
  readonly zlibStart: number;
  readonly leftover: Uint8Array;
}

async function readEntryHeader(
  transport: Transport,
  packUrl: string,
  offset: number,
): Promise<EntryHeader> {
  let bufSize = INITIAL_ENTRY_HEADER_SIZE;
  for (;;) {
    const buf = await transport.fetchRange(packUrl, offset, bufSize);
    const parsed = tryParseEntryHeader(buf, offset);
    if (parsed) {
      return parsed;
    }
    if (buf.length < bufSize || bufSize >= MAX_ENTRY_HEADER_SIZE) {
      throw new Error(`Could not parse pack entry header at offset ${offset}`);
    }
    bufSize *= 2;
  }
}

/** A cursor over `buf` that signals "need more data" via `undefined` reads,
 * rather than throwing, so the caller can grow the buffer and retry. */
class ShortBuffer {
  pos = 0;
  constructor(private readonly buf: Uint8Array) {}

  next(): number | undefined {
    const byte = this.buf[this.pos];
    if (byte === undefined) {
      return undefined;
    }
    this.pos++;
    return byte;
  }

  remainingFrom(pos: number): Uint8Array {
    return this.buf.subarray(pos);
  }

  slice(start: number, end: number): Uint8Array | undefined {
    if (end > this.buf.length) {
      return undefined;
    }
    return this.buf.subarray(start, end);
  }
}

function tryParseEntryHeader(
  buf: Uint8Array,
  offset: number,
): EntryHeader | undefined {
  const cursor = new ShortBuffer(buf);

  let byte = cursor.next();
  if (byte === undefined) {
    return undefined;
  }
  const type = (byte >> 4) & 0x7;
  let size = byte & 0x0f;
  let shift = 4;
  while (byte & 0x80) {
    byte = cursor.next();
    if (byte === undefined) {
      return undefined;
    }
    size += (byte & 0x7f) * Math.pow(2, shift);
    shift += 7;
  }

  let ofsBase: number | undefined;
  let refBase: Oid | undefined;

  if (type === OBJ_OFS_DELTA) {
    let b = cursor.next();
    if (b === undefined) {
      return undefined;
    }
    let result = b & 0x7f;
    while (b & 0x80) {
      b = cursor.next();
      if (b === undefined) {
        return undefined;
      }
      result = (result + 1) * 128 + (b & 0x7f);
    }
    ofsBase = offset - result;
  } else if (type === OBJ_REF_DELTA) {
    const oidBytes = cursor.slice(cursor.pos, cursor.pos + 20);
    if (!oidBytes) {
      return undefined;
    }
    refBase = bytesToHex(oidBytes);
    cursor.pos += 20;
  }

  return {
    type,
    size,
    ofsBase,
    refBase,
    zlibStart: offset + cursor.pos,
    leftover: cursor.remainingFrom(cursor.pos),
  };
}

async function inflateEntryPayload(
  transport: Transport,
  packUrl: string,
  entry: EntryHeader,
): Promise<Uint8Array> {
  let servedLeftover = false;
  let position = entry.zlibStart + entry.leftover.length;

  const data = await inflateStream(async () => {
    if (!servedLeftover) {
      servedLeftover = true;
      if (entry.leftover.length > 0) {
        return entry.leftover;
      }
    }
    const chunk = await transport.fetchRange(
      packUrl,
      position,
      PACK_READ_CHUNK,
    );
    if (chunk.length === 0) {
      return null;
    }
    position += chunk.length;
    return chunk;
  });

  return data;
}

function readDeltaByte(delta: Uint8Array, pos: number): number {
  return definite(delta[pos], "Truncated delta: ran out of bytes");
}

function readDeltaVarint(
  delta: Uint8Array,
  pos: number,
): { value: number; pos: number } {
  let shift = 0;
  let result = 0;
  let byte: number;
  do {
    byte = readDeltaByte(delta, pos);
    pos++;
    result += (byte & 0x7f) * Math.pow(2, shift);
    shift += 7;
  } while (byte & 0x80);
  return { value: result, pos };
}

function applyDelta(delta: Uint8Array, base: Uint8Array): Uint8Array {
  let pos = 0;
  const baseSize = readDeltaVarint(delta, pos);
  pos = baseSize.pos;
  const resultSize = readDeltaVarint(delta, pos);
  pos = resultSize.pos;

  if (baseSize.value !== base.length) {
    throw new Error(
      `Delta base size mismatch: expected ${baseSize.value}, got ${base.length}`,
    );
  }

  const result = new Uint8Array(resultSize.value);
  let outPos = 0;

  while (pos < delta.length) {
    const opcode = readDeltaByte(delta, pos);
    pos++;

    if (opcode & 0x80) {
      let copyOffset = 0;
      let copySize = 0;
      if (opcode & 0x01) {
        copyOffset += readDeltaByte(delta, pos++);
      }
      if (opcode & 0x02) {
        copyOffset += readDeltaByte(delta, pos++) << 8;
      }
      if (opcode & 0x04) {
        copyOffset += readDeltaByte(delta, pos++) << 16;
      }
      if (opcode & 0x08) {
        copyOffset += readDeltaByte(delta, pos++) * 0x1_00_00_00;
      }
      if (opcode & 0x10) {
        copySize += readDeltaByte(delta, pos++);
      }
      if (opcode & 0x20) {
        copySize += readDeltaByte(delta, pos++) << 8;
      }
      if (opcode & 0x40) {
        copySize += readDeltaByte(delta, pos++) << 16;
      }
      if (copySize === 0) {
        copySize = 0x1_00_00;
      }
      result.set(base.subarray(copyOffset, copyOffset + copySize), outPos);
      outPos += copySize;
    } else if (opcode === 0) {
      throw new Error("Invalid delta opcode 0");
    } else {
      const len = opcode;
      result.set(delta.subarray(pos, pos + len), outPos);
      pos += len;
      outPos += len;
    }
  }

  return result;
}

/** Convenience wrapper: look up `oid` across all `packNames` in order. */
export async function findObjectInPacks(
  transport: Transport,
  baseUrl: string,
  packNames: readonly string[],
  oid: Oid,
  resolveRefDelta: ResolveObject,
): Promise<RawObject | undefined> {
  for (const packName of packNames) {
    const idx = await loadPackIndex(transport, baseUrl, packName);
    const offset = await findOidOffset(transport, idx, oid);
    if (offset === undefined) {
      continue;
    }
    return readObjectAtOffset(transport, idx.packUrl, offset, resolveRefDelta);
  }
  return undefined;
}
