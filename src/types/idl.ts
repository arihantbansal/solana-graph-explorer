/**
 * Anchor IDL v0.30+ TypeScript types
 * Supports both legacy (pre-0.30) and current format
 */

export interface IdlField {
  name: string;
  type: IdlType;
  docs?: string[];
}

export type IdlType =
  | "bool"
  | "u8"
  | "i8"
  | "u16"
  | "i16"
  | "u32"
  | "i32"
  | "u64"
  | "i64"
  | "u128"
  | "i128"
  | "f32"
  | "f64"
  | "bytes"
  | "string"
  | "pubkey"
  | "publicKey" // legacy format
  | { vec: IdlType }
  | { option: IdlType }
  | { coption: IdlType }
  | { array: [IdlType, number] }
  | { defined: { name: string } }
  | { defined: string }; // legacy format

export interface IdlTypeDef {
  name: string;
  type: {
    kind: "struct" | "enum";
    fields?: IdlField[];
    variants?: IdlEnumVariant[];
  };
  docs?: string[];
}

export interface IdlEnumVariant {
  name: string;
  fields?: IdlField[] | IdlType[];
}

export interface IdlAccountDef {
  name: string;
  discriminator: number[];
}

export interface IdlInstructionAccountDef {
  name: string;
  writable?: boolean;
  signer?: boolean;
  optional?: boolean;
  address?: string;
  pda?: IdlPda;
  relations?: string[];
  docs?: string[];
  /** Nested accounts struct (e.g. "common" containing multiple accounts) */
  accounts?: IdlInstructionAccountDef[];
}

export interface IdlPda {
  seeds: IdlSeed[];
  program?: IdlSeedValue;
}

export type IdlSeed =
  | { kind: "const"; value: number[] | string }
  | { kind: "account"; path: string; account?: string }
  | { kind: "arg"; path: string };

export type IdlSeedValue =
  | { kind: "const"; value: string }
  | { kind: "account"; path: string };

export interface IdlInstruction {
  name: string;
  discriminator: number[];
  accounts: IdlInstructionAccountDef[];
  args: IdlField[];
  docs?: string[];
}

export interface IdlMetadata {
  name: string;
  version: string;
  spec?: string; // present in v0.30+
  description?: string;
}

export interface Idl {
  address?: string;
  metadata: IdlMetadata;
  instructions: IdlInstruction[];
  accounts?: IdlAccountDef[];
  types?: IdlTypeDef[];
  errors?: { code: number; name: string; msg?: string }[];
  events?: { name: string; discriminator: number[] }[];
  // Legacy fields
  name?: string;
  version?: string;
}

export function isLegacyIdl(idl: Idl): boolean {
  return !idl.metadata?.spec;
}

export function getDefinedTypeName(type: { defined: { name: string } | string }): string {
  if (typeof type.defined === "string") {
    return type.defined;
  }
  return type.defined.name;
}
