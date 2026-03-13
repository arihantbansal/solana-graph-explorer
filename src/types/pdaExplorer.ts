import type { Idl, IdlSeed } from "./idl";

export type BufferEncoding = "utf8" | "hex" | "base58" | "base64";

/** Dropdown options for buffer encoding selectors */
export const BUFFER_ENCODING_OPTIONS: { value: BufferEncoding; label: string }[] = [
  { value: "utf8", label: "UTF-8" },
  { value: "hex", label: "Hex" },
  { value: "base58", label: "Base58" },
  { value: "base64", label: "Base64" },
];

/** Transforms applied to a seed value after encoding */
export type SeedTransform = "sha256";

export interface ProgramEntry {
  programId: string;
  programName: string;
  idlFetchedAt?: number; // Unix timestamp ms — optional, may be absent after import
  idl?: Idl | null;
}

export interface PdaDefinition {
  /** Human-readable name from the instruction account (e.g. "user_stats") */
  name: string;
  /** Which instruction(s) this PDA appears in */
  instructionNames: string[];
  /** The seed definitions from the IDL */
  seeds: IdlSeed[];
  /** Program that owns this PDA (usually the IDL's program, but can differ if pda.program is set) */
  programId: string;
}

export interface SeedInputValue {
  seed: IdlSeed;
  /** The raw string value entered by the user */
  value: string;
  /** For bytes/buffer seeds: how to encode the string into bytes */
  bufferEncoding?: BufferEncoding;
  /** Optional transform to apply after encoding (e.g. SHA-256 hash) */
  transform?: SeedTransform;
}

export interface PdaDerivationResult {
  address: string;
  bump: number;
  seeds: SeedInputValue[];
}

/** A pre-filled seed value for a saved PDA search */
export interface SavedSeedValue {
  seedIndex: number;
  /** Empty string means user fills at search time */
  value: string;
  encoding?: BufferEncoding;
  transform?: SeedTransform;
}

/** A saved/favorited PDA search with partially pre-filled seeds */
export interface SavedPdaSearch {
  id: string;
  name: string;
  programId: string;
  programName: string;
  pdaName: string;
  seeds: IdlSeed[];
  prefilledValues: SavedSeedValue[];
}

// ─── Custom seed types shared between PdaSearch and PdaRuleCreator ───

export type CustomSeedType = "pubkey" | "string" | "bytes";

export const CUSTOM_SEED_TYPES: { value: CustomSeedType; label: string }[] = [
  { value: "pubkey", label: "Pubkey (base58)" },
  { value: "string", label: "String (UTF-8)" },
  { value: "bytes", label: "Bytes (custom encoding)" },
];

export interface CustomSeedState {
  label: string;
  type: CustomSeedType;
  value: string;
  encoding: BufferEncoding;
  transform?: SeedTransform;
}

export function makeEmptyCustomSeed(): CustomSeedState {
  return { label: "", type: "string", value: "", encoding: "utf8" };
}

/**
 * Convert a custom seed into an IdlSeed for derivation/persistence.
 * Pubkey → "account" kind (base58 decoding), otherwise → "arg" kind.
 */
export function customSeedToIdlSeed(seed: { type?: CustomSeedType; customSeedType?: CustomSeedType; label?: string; customLabel?: string }): IdlSeed {
  const seedType = seed.type ?? seed.customSeedType ?? "string";
  const label = seed.label ?? seed.customLabel ?? "custom";
  if (seedType === "pubkey") {
    return { kind: "account", path: label || "custom" };
  }
  return { kind: "arg", path: label || "custom" };
}
