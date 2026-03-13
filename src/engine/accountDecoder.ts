import type { Idl, IdlType, IdlTypeDef } from "@/types/idl";
import { getDefinedTypeName } from "@/types/idl";
import {
  getU8Decoder,
  getU16Decoder,
  getU32Decoder,
  getU64Decoder,
  getU128Decoder,
  getI8Decoder,
  getI16Decoder,
  getI32Decoder,
  getI64Decoder,
  getI128Decoder,
  getF32Decoder,
  getF64Decoder,
  getBooleanDecoder,
  getAddressDecoder,
} from "@solana/kit";

// Pre-create decoders (they're stateless and reusable)
const u8 = getU8Decoder();
const u16 = getU16Decoder();
const u32 = getU32Decoder();
const u64 = getU64Decoder();
const u128 = getU128Decoder();
const i8d = getI8Decoder();
const i16 = getI16Decoder();
const i32 = getI32Decoder();
const i64 = getI64Decoder();
const i128 = getI128Decoder();
const f32 = getF32Decoder();
const f64 = getF64Decoder();
const bool = getBooleanDecoder();
const addressDecoder = getAddressDecoder();

// --- BorshReader using @solana/kit codecs ---

export class BorshReader {
  private bytes: Uint8Array;
  offset: number;

  constructor(buffer: Uint8Array) {
    this.bytes = buffer;
    this.offset = 0;
  }

  readU8(): number {
    const [val, next] = u8.read(this.bytes, this.offset);
    this.offset = next;
    return val;
  }

  readU16(): number {
    const [val, next] = u16.read(this.bytes, this.offset);
    this.offset = next;
    return val;
  }

  readU32(): number {
    const [val, next] = u32.read(this.bytes, this.offset);
    this.offset = next;
    return val;
  }

  readU64(): bigint {
    const [val, next] = u64.read(this.bytes, this.offset);
    this.offset = next;
    return val;
  }

  readU128(): bigint {
    const [val, next] = u128.read(this.bytes, this.offset);
    this.offset = next;
    return val;
  }

  readI8(): number {
    const [val, next] = i8d.read(this.bytes, this.offset);
    this.offset = next;
    return val;
  }

  readI16(): number {
    const [val, next] = i16.read(this.bytes, this.offset);
    this.offset = next;
    return val;
  }

  readI32(): number {
    const [val, next] = i32.read(this.bytes, this.offset);
    this.offset = next;
    return val;
  }

  readI64(): bigint {
    const [val, next] = i64.read(this.bytes, this.offset);
    this.offset = next;
    return val;
  }

  readI128(): bigint {
    const [val, next] = i128.read(this.bytes, this.offset);
    this.offset = next;
    return val;
  }

  readBool(): boolean {
    const [val, next] = bool.read(this.bytes, this.offset);
    this.offset = next;
    return val;
  }

  readF32(): number {
    const [val, next] = f32.read(this.bytes, this.offset);
    this.offset = next;
    return val;
  }

  readF64(): number {
    const [val, next] = f64.read(this.bytes, this.offset);
    this.offset = next;
    return val;
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
    const [addr, next] = addressDecoder.read(this.bytes, this.offset);
    this.offset = next;
    return addr as string;
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
        return reader.readU128();
      case "i128":
        return reader.readI128();
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
    // COption uses u32 tag (0 = None, 1 = Some).
    // Unlike Borsh Option, COption always allocates space for the inner value,
    // so we must always read (and skip) the inner bytes.
    const tag = reader.readU32();
    const value = readField(reader, type.coption, idl);
    if (tag === 0) return null;
    return value;
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
    return decodeDefinedType(reader, typeDef, idl);
  }

  throw new Error(`Unknown type: ${JSON.stringify(type)}`);
}

// --- Defined type decoder (dispatches to struct or enum) ---

function decodeDefinedType(
  reader: BorshReader,
  typeDef: IdlTypeDef,
  idl: Idl,
): unknown {
  if (typeDef.type.kind === "enum") {
    return decodeEnum(reader, typeDef, idl);
  }
  return decodeStruct(reader, typeDef, idl);
}

// --- Enum decoder ---

function decodeEnum(
  reader: BorshReader,
  typeDef: IdlTypeDef,
  idl: Idl,
): unknown {
  const variants = typeDef.type.variants;
  if (!variants) {
    throw new Error(`Enum type has no variants: ${typeDef.name}`);
  }

  const variantIndex = reader.readU8();
  if (variantIndex >= variants.length) {
    throw new Error(
      `Enum variant index ${variantIndex} out of range for ${typeDef.name} (${variants.length} variants)`,
    );
  }

  const variant = variants[variantIndex];

  // Simple enum (no fields) — return the variant name as a string
  if (!variant.fields || variant.fields.length === 0) {
    return variant.name;
  }

  // Enum with named fields (struct-like): fields are IdlField[]
  // Enum with tuple fields: fields are IdlType[]
  const fields = variant.fields;
  if (typeof fields[0] === "object" && "name" in fields[0]) {
    // Named fields (struct-like variant)
    const result: Record<string, unknown> = { _variant: variant.name };
    for (const field of fields as { name: string; type: IdlType }[]) {
      result[field.name] = readField(reader, field.type, idl);
    }
    return result;
  }

  // Tuple fields
  const tupleValues = (fields as IdlType[]).map((fieldType) =>
    readField(reader, fieldType, idl),
  );
  if (tupleValues.length === 1) {
    return { _variant: variant.name, value: tupleValues[0] };
  }
  return { _variant: variant.name, values: tupleValues };
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
