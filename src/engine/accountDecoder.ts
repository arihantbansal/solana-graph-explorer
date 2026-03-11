import type { Idl, IdlType, IdlTypeDef } from "@/types/idl";
import { getDefinedTypeName } from "@/types/idl";

// --- Minimal base58 encoder ---

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function encodeBase58(bytes: Uint8Array): string {
  // Count leading zeros
  let leadingZeros = 0;
  for (const b of bytes) {
    if (b !== 0) break;
    leadingZeros++;
  }

  // Convert byte array to bigint
  let num = 0n;
  for (const b of bytes) {
    num = num * 256n + BigInt(b);
  }

  // Convert to base58
  const chars: string[] = [];
  while (num > 0n) {
    const remainder = Number(num % 58n);
    num = num / 58n;
    chars.unshift(BASE58_ALPHABET[remainder]);
  }

  // Add leading '1's for leading zero bytes
  for (let i = 0; i < leadingZeros; i++) {
    chars.unshift("1");
  }

  return chars.join("") || "1";
}

// --- BorshReader ---

export class BorshReader {
  private data: DataView;
  private bytes: Uint8Array;
  offset: number;

  constructor(buffer: Uint8Array) {
    this.bytes = buffer;
    this.data = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    this.offset = 0;
  }

  readU8(): number {
    const val = this.data.getUint8(this.offset);
    this.offset += 1;
    return val;
  }

  readU16(): number {
    const val = this.data.getUint16(this.offset, true);
    this.offset += 2;
    return val;
  }

  readU32(): number {
    const val = this.data.getUint32(this.offset, true);
    this.offset += 4;
    return val;
  }

  readU64(): bigint {
    const val = this.data.getBigUint64(this.offset, true);
    this.offset += 8;
    return val;
  }

  readU128(): bigint {
    const lo = this.data.getBigUint64(this.offset, true);
    const hi = this.data.getBigUint64(this.offset + 8, true);
    this.offset += 16;
    return (hi << 64n) | lo;
  }

  readI8(): number {
    const val = this.data.getInt8(this.offset);
    this.offset += 1;
    return val;
  }

  readI16(): number {
    const val = this.data.getInt16(this.offset, true);
    this.offset += 2;
    return val;
  }

  readI32(): number {
    const val = this.data.getInt32(this.offset, true);
    this.offset += 4;
    return val;
  }

  readI64(): bigint {
    const val = this.data.getBigInt64(this.offset, true);
    this.offset += 8;
    return val;
  }

  readBool(): boolean {
    const val = this.readU8();
    return val !== 0;
  }

  readString(): string {
    const len = this.readU32();
    const strBytes = this.bytes.slice(this.offset, this.offset + len);
    this.offset += len;
    return new TextDecoder().decode(strBytes);
  }

  readBytes(): Uint8Array {
    const len = this.readU32();
    const result = this.bytes.slice(this.offset, this.offset + len);
    this.offset += len;
    return result;
  }

  readPubkey(): string {
    const keyBytes = this.bytes.slice(this.offset, this.offset + 32);
    this.offset += 32;
    return encodeBase58(keyBytes);
  }

  readVec<T>(innerReader: () => T): T[] {
    const len = this.readU32();
    const result: T[] = [];
    for (let i = 0; i < len; i++) {
      result.push(innerReader());
    }
    return result;
  }

  readOption<T>(innerReader: () => T): T | null {
    const tag = this.readU8();
    if (tag === 0) return null;
    return innerReader();
  }

  readF32(): number {
    const val = this.data.getFloat32(this.offset, true);
    this.offset += 4;
    return val;
  }

  readF64(): number {
    const val = this.data.getFloat64(this.offset, true);
    this.offset += 8;
    return val;
  }

  readFixedArray<T>(innerReader: () => T, size: number): T[] {
    const result: T[] = [];
    for (let i = 0; i < size; i++) {
      result.push(innerReader());
    }
    return result;
  }
}

// --- Account identification ---

export function identifyAccountType(
  data: Uint8Array,
  idl: Idl,
): { name: string; discriminator: number[] } | null {
  if (!idl.accounts || data.length < 8) return null;

  for (const account of idl.accounts) {
    const disc = account.discriminator;
    if (disc.length !== 8) continue;

    let match = true;
    for (let i = 0; i < 8; i++) {
      if (data[i] !== disc[i]) {
        match = false;
        break;
      }
    }
    if (match) return account;
  }

  return null;
}

// --- Field reader ---

function readField(
  reader: BorshReader,
  type: IdlType,
  idl: Idl,
): unknown {
  if (typeof type === "string") {
    switch (type) {
      case "bool":
        return reader.readBool();
      case "u8":
        return reader.readU8();
      case "i8":
        return reader.readI8();
      case "u16":
        return reader.readU16();
      case "i16":
        return reader.readI16();
      case "u32":
        return reader.readU32();
      case "i32":
        return reader.readI32();
      case "u64":
        return reader.readU64();
      case "i64":
        return reader.readI64();
      case "u128":
      case "i128":
        return reader.readU128();
      case "f32":
        return reader.readF32();
      case "f64":
        return reader.readF64();
      case "string":
        return reader.readString();
      case "bytes":
        return reader.readBytes();
      case "pubkey":
      case "publicKey":
        return reader.readPubkey();
      default:
        throw new Error(`Unknown primitive type: ${type}`);
    }
  }

  if ("vec" in type) {
    return reader.readVec(() => readField(reader, type.vec, idl));
  }

  if ("option" in type) {
    return reader.readOption(() => readField(reader, type.option, idl));
  }

  if ("coption" in type) {
    // COption uses u32 tag (0 = None, 1 = Some)
    const tag = reader.readU32();
    if (tag === 0) return null;
    return readField(reader, type.coption, idl);
  }

  if ("array" in type) {
    const [innerType, size] = type.array;
    return reader.readFixedArray(() => readField(reader, innerType, idl), size);
  }

  if ("defined" in type) {
    const name = getDefinedTypeName(type as { defined: { name: string } | string });
    const typeDef = idl.types?.find((t) => t.name === name);
    if (!typeDef) {
      throw new Error(`Defined type not found: ${name}`);
    }
    return decodeStruct(reader, typeDef, idl);
  }

  throw new Error(`Unknown type: ${JSON.stringify(type)}`);
}

// --- Struct decoder ---

function decodeStruct(
  reader: BorshReader,
  typeDef: IdlTypeDef,
  idl: Idl,
): Record<string, unknown> {
  if (typeDef.type.kind !== "struct" || !typeDef.type.fields) {
    throw new Error(`Cannot decode non-struct type: ${typeDef.name}`);
  }

  const result: Record<string, unknown> = {};
  for (const field of typeDef.type.fields) {
    result[field.name] = readField(reader, field.type, idl);
  }
  return result;
}

// --- Public API ---

/**
 * Decode account data given a type definition and IDL.
 * Skips the 8-byte discriminator prefix.
 */
export function decodeAccountData(
  data: Uint8Array,
  typeDef: IdlTypeDef,
  idl: Idl,
): Record<string, unknown> {
  const reader = new BorshReader(data);
  // Skip 8-byte discriminator
  reader.offset = 8;
  return decodeStruct(reader, typeDef, idl);
}

/**
 * Decode struct data without discriminator (for direct struct decoding).
 */
export function decodeStructData(
  data: Uint8Array,
  typeDef: IdlTypeDef,
  idl: Idl,
): Record<string, unknown> {
  const reader = new BorshReader(data);
  return decodeStruct(reader, typeDef, idl);
}
