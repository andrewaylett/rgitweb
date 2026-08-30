/** Small binary/hex helpers shared across the pack, loose, and object parsers. */

const HEX_CHARS = [
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "a",
  "b",
  "c",
  "d",
  "e",
  "f",
];

export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) {
    const hi = HEX_CHARS[byte >> 4];
    const lo = HEX_CHARS[byte & 0x0f];
    if (hi === undefined || lo === undefined) {
      throw new Error(`Impossible byte value ${byte}`);
    }
    out += hi + lo;
  }
  return out;
}

export function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function readU32BE(buf: Uint8Array, offset: number): number {
  if (offset + 4 > buf.length) {
    throw new Error(`Buffer too short to read a u32 at offset ${offset}`);
  }
  const view = new DataView(buf.buffer, buf.byteOffset + offset, 4);
  return view.getUint32(0, false);
}

/** Compares two equal-length byte arrays lexicographically, like memcmp. */
export function compareBytes(a: Uint8Array, b: Uint8Array): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i];
    const bv = b[i];
    if (av === undefined || bv === undefined) {
      break;
    }
    const diff = av - bv;
    if (diff !== 0) {
      return diff;
    }
  }
  return a.length - b.length;
}
