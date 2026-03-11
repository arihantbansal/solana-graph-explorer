import type { Idl, IdlSeed } from "./idl";

export type BufferEncoding = "utf8" | "hex" | "base58" | "base64";

export interface ProgramEntry {
  programId: string;
  programName: string;
  idlFetchedAt: number; // Unix timestamp ms
  idl: Idl;
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
}

export interface PdaDerivationResult {
  address: string;
  bump: number;
  seeds: SeedInputValue[];
}
