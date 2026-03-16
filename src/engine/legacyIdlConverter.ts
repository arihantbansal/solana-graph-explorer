/**
 * Legacy Anchor IDL converter.
 * Converts pre-0.30 Anchor IDL format to the v0.30+ format with discriminators.
 * Port of `anchor idl convert` — no @coral-xyz/anchor dependency.
 */

import { sha256 } from "@noble/hashes/sha2.js";

// ─── Legacy IDL types ───────────────────────────────────────────────

interface LegacyIdlField {
  name: string;
  type: LegacyIdlType;
  docs?: string[];
}

type LegacyIdlType =
  | string
  | { vec: LegacyIdlType }
  | { option: LegacyIdlType }
  | { coption: LegacyIdlType }
  | { array: [LegacyIdlType, number] }
  | { defined: string }
  | { hashMap: [LegacyIdlType, LegacyIdlType] };

interface LegacyIdlAccount {
  name: string;
  isMut: boolean;
  isSigner: boolean;
  isOptional?: boolean;
  docs?: string[];
  pda?: LegacyIdlPda;
}

interface LegacyIdlPda {
  seeds: LegacyIdlSeed[];
  programId?: LegacyIdlSeedComponent;
}

interface LegacyIdlSeed {
  kind: "const" | "account" | "arg";
  value?: unknown;
  type?: LegacyIdlType;
  path?: string;
  account?: string;
}

interface LegacyIdlSeedComponent {
  kind: "const" | "account";
  value?: unknown;
  path?: string;
}

interface LegacyIdlAccountsStruct {
  name: string;
  accounts: (LegacyIdlAccount | LegacyIdlAccountsStruct)[];
}

interface LegacyIdlInstruction {
  name: string;
  accounts: (LegacyIdlAccount | LegacyIdlAccountsStruct)[];
  args: LegacyIdlField[];
  docs?: string[];
}

interface LegacyIdlTypeDef {
  name: string;
  type: {
    kind: "struct" | "enum";
    fields?: LegacyIdlField[];
    variants?: LegacyIdlEnumVariant[];
  };
  docs?: string[];
}

interface LegacyIdlEnumVariant {
  name: string;
  fields?: LegacyIdlField[] | LegacyIdlType[];
}

interface LegacyIdlAccountDef {
  name: string;
  type: {
    kind: "struct";
    fields: LegacyIdlField[];
  };
  docs?: string[];
}

interface LegacyIdlEvent {
  name: string;
  fields: LegacyIdlField[];
}

interface LegacyIdlError {
  code: number;
  name: string;
  msg?: string;
}

interface LegacyIdl {
  name: string;
  version: string;
  instructions: LegacyIdlInstruction[];
  accounts?: LegacyIdlAccountDef[];
  types?: LegacyIdlTypeDef[];
  events?: LegacyIdlEvent[];
  errors?: LegacyIdlError[];
  metadata?: Record<string, unknown>;
}

// ─── Helpers ────────────────────────────────────────────────────────

/** Convert camelCase to snake_case */
function toSnakeCase(s: string): string {
  return s.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "");
}

/** Compute discriminator bytes from a preimage string */
function computeDiscriminator(preimage: string): number[] {
  const hash = sha256(new TextEncoder().encode(preimage));
  return Array.from(hash.slice(0, 8));
}

// ─── Type conversion ────────────────────────────────────────────────

import type {
  IdlType,
  IdlField,
  IdlInstructionAccountDef,
  IdlInstruction,
  IdlTypeDef,
  IdlEnumVariant,
  IdlAccountDef,
  IdlPda,
  IdlSeed,
  Idl,
} from "@/types/idl";

function convertType(t: LegacyIdlType): IdlType {
  if (typeof t === "string") {
    if (t === "publicKey") return "pubkey";
    return t as IdlType;
  }
  if ("vec" in t) return { vec: convertType(t.vec) };
  if ("option" in t) return { option: convertType(t.option) };
  if ("coption" in t) return { coption: convertType(t.coption) };
  if ("array" in t) return { array: [convertType(t.array[0]), t.array[1]] };
  if ("defined" in t) return { defined: { name: t.defined } };
  if ("hashMap" in t) {
    // Anchor IDL hashMap not directly supported — treat as bytes
    return "bytes";
  }
  return "bytes";
}

function convertField(f: LegacyIdlField): IdlField {
  return {
    name: toSnakeCase(f.name),
    type: convertType(f.type),
    ...(f.docs ? { docs: f.docs } : {}),
  };
}

// ─── Account conversion ─────────────────────────────────────────────

function isAccountsStruct(
  acc: LegacyIdlAccount | LegacyIdlAccountsStruct,
): acc is LegacyIdlAccountsStruct {
  return "accounts" in acc;
}

function convertPdaSeed(seed: LegacyIdlSeed): IdlSeed {
  switch (seed.kind) {
    case "const": {
      if (seed.type === "string" && typeof seed.value === "string") {
        return { kind: "const", value: seed.value };
      }
      // For byte arrays or other const values, encode as number array
      if (Array.isArray(seed.value)) {
        return { kind: "const", value: seed.value as number[] };
      }
      return { kind: "const", value: String(seed.value ?? "") };
    }
    case "account":
      return {
        kind: "account",
        path: toSnakeCase(seed.path ?? ""),
        ...(seed.account ? { account: seed.account } : {}),
      };
    case "arg":
      return { kind: "arg", path: toSnakeCase(seed.path ?? "") };
  }
}

function convertPda(pda: LegacyIdlPda): IdlPda {
  const result: IdlPda = {
    seeds: pda.seeds.map(convertPdaSeed),
  };
  if (pda.programId) {
    if (pda.programId.kind === "const" && typeof pda.programId.value === "string") {
      result.program = { kind: "const", value: pda.programId.value as string };
    } else if (pda.programId.kind === "account" && pda.programId.path) {
      result.program = { kind: "account", path: pda.programId.path };
    }
  }
  return result;
}

function flattenAccounts(
  accounts: (LegacyIdlAccount | LegacyIdlAccountsStruct)[],
): IdlInstructionAccountDef[] {
  const result: IdlInstructionAccountDef[] = [];
  for (const acc of accounts) {
    if (isAccountsStruct(acc)) {
      // Flatten nested account structs with prefixed names
      const nested = flattenAccounts(acc.accounts);
      result.push({
        name: toSnakeCase(acc.name),
        accounts: nested,
      });
    } else {
      const converted: IdlInstructionAccountDef = {
        name: toSnakeCase(acc.name),
        ...(acc.isMut ? { writable: true } : {}),
        ...(acc.isSigner ? { signer: true } : {}),
        ...(acc.isOptional ? { optional: true } : {}),
        ...(acc.docs ? { docs: acc.docs } : {}),
      };
      if (acc.pda) {
        converted.pda = convertPda(acc.pda);
      }
      result.push(converted);
    }
  }
  return result;
}

// ─── Instruction conversion ─────────────────────────────────────────

function convertInstruction(ix: LegacyIdlInstruction): IdlInstruction {
  const snakeName = toSnakeCase(ix.name);
  const discriminator = computeDiscriminator(`global:${snakeName}`);
  return {
    name: snakeName,
    discriminator,
    accounts: flattenAccounts(ix.accounts),
    args: ix.args.map(convertField),
    ...(ix.docs ? { docs: ix.docs } : {}),
  };
}

// ─── Type definition conversion ─────────────────────────────────────

function convertEnumVariant(v: LegacyIdlEnumVariant): IdlEnumVariant {
  const result: IdlEnumVariant = { name: v.name };
  if (v.fields && v.fields.length > 0) {
    // Check if fields are named (IdlField[]) or positional (IdlType[])
    if (typeof v.fields[0] === "object" && "name" in (v.fields[0] as LegacyIdlField)) {
      result.fields = (v.fields as LegacyIdlField[]).map(convertField);
    } else {
      result.fields = (v.fields as LegacyIdlType[]).map(convertType);
    }
  }
  return result;
}

function convertTypeDef(td: LegacyIdlTypeDef): IdlTypeDef {
  const result: IdlTypeDef = {
    name: td.name,
    type: { kind: td.type.kind },
    ...(td.docs ? { docs: td.docs } : {}),
  };
  if (td.type.kind === "struct" && td.type.fields) {
    result.type.fields = td.type.fields.map(convertField);
  }
  if (td.type.kind === "enum" && td.type.variants) {
    result.type.variants = td.type.variants.map(convertEnumVariant);
  }
  return result;
}

// ─── Account type → type def + account entry ────────────────────────

function convertAccountDef(acc: LegacyIdlAccountDef): { typeDef: IdlTypeDef; accountDef: IdlAccountDef } {
  const discriminator = computeDiscriminator(`account:${acc.name}`);
  return {
    typeDef: {
      name: acc.name,
      type: {
        kind: "struct",
        fields: acc.type.fields.map(convertField),
      },
      ...(acc.docs ? { docs: acc.docs } : {}),
    },
    accountDef: {
      name: acc.name,
      discriminator,
    },
  };
}

// ─── Main conversion ────────────────────────────────────────────────

/**
 * Detect if an IDL object is in legacy (pre-0.30) format.
 * Legacy format has no `metadata.spec` field and has top-level `name`/`version`.
 */
export function isLegacyFormat(idl: Record<string, unknown>): boolean {
  const metadata = idl.metadata as Record<string, unknown> | undefined;
  if (metadata?.spec) return false;
  return typeof idl.name === "string" && typeof idl.version === "string";
}

/**
 * Convert a legacy Anchor IDL to v0.30+ format.
 */
export function convertLegacyIdl(legacyIdl: LegacyIdl, programAddress?: string): Idl {
  const instructions = legacyIdl.instructions.map(convertInstruction);

  const types: IdlTypeDef[] = [];
  const accounts: IdlAccountDef[] = [];

  // Convert account definitions
  if (legacyIdl.accounts) {
    for (const acc of legacyIdl.accounts) {
      const { typeDef, accountDef } = convertAccountDef(acc);
      types.push(typeDef);
      accounts.push(accountDef);
    }
  }

  // Convert type definitions
  if (legacyIdl.types) {
    for (const td of legacyIdl.types) {
      types.push(convertTypeDef(td));
    }
  }

  // Convert events to type definitions
  const events: { name: string; discriminator: number[] }[] = [];
  if (legacyIdl.events) {
    for (const ev of legacyIdl.events) {
      const discriminator = computeDiscriminator(`event:${ev.name}`);
      events.push({ name: ev.name, discriminator });
      types.push({
        name: ev.name,
        type: {
          kind: "struct",
          fields: ev.fields.map(convertField),
        },
      });
    }
  }

  const idl: Idl = {
    metadata: {
      name: toSnakeCase(legacyIdl.name),
      version: legacyIdl.version,
      spec: "0.1.0",
    },
    instructions,
    accounts,
    types,
    ...(events.length > 0 ? { events } : {}),
    ...(legacyIdl.errors ? { errors: legacyIdl.errors } : {}),
  };

  if (programAddress) {
    idl.address = programAddress;
  }

  return idl;
}
