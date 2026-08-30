/** Reading loose objects (`objects/<2>/<38>`). */

import { inflateAll } from "./inflate.js";
import {
  NotFoundError,
  ObjectTypes,
  type ObjectType,
  type Oid,
} from "./types.js";
import { type Transport } from "./transport.js";

export interface RawObject {
  readonly type: ObjectType;
  readonly data: Uint8Array;
}

/** Returns `undefined` if there is no loose object for this oid (404). */
export async function readLooseObject(
  transport: Transport,
  baseUrl: string,
  oid: Oid,
): Promise<RawObject | undefined> {
  const url = `${baseUrl}/objects/${oid.slice(0, 2)}/${oid.slice(2)}`;
  let compressed: Uint8Array;
  try {
    compressed = await transport.fetchBinary(url);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return undefined;
    }
    throw error;
  }

  const inflated = inflateAll(compressed);
  return parseLooseObject(oid, inflated);
}

function parseLooseObject(oid: Oid, data: Uint8Array): RawObject {
  const nulIndex = data.indexOf(0);
  if (nulIndex === -1) {
    throw new Error(`Malformed loose object ${oid}: no header terminator`);
  }
  const header = new TextDecoder("utf-8").decode(data.subarray(0, nulIndex));
  const spaceIndex = header.indexOf(" ");
  if (spaceIndex === -1) {
    throw new Error(`Malformed loose object ${oid}: bad header "${header}"`);
  }
  const type = header.slice(0, spaceIndex);
  const size = Number(header.slice(spaceIndex + 1));
  if (!(ObjectTypes as readonly string[]).includes(type)) {
    throw new Error(`Malformed loose object ${oid}: unknown type "${type}"`);
  }
  const payload = data.subarray(nulIndex + 1);
  if (payload.length !== size) {
    throw new Error(
      `Malformed loose object ${oid}: declared size ${size} but got ${payload.length} bytes`,
    );
  }
  return { type: type as ObjectType, data: payload };
}
