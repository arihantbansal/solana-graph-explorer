import type { BufferEncoding, SeedTransform } from "./pdaExplorer";
import type { IdlSeed } from "./idl";

export type RelationshipType = "has_one" | "pda_seed" | "token" | "user_defined";

export interface BaseRelationship {
  sourceAddress: string;
  targetAddress: string;
  type: RelationshipType;
  label: string;
}

export interface HasOneRelationship extends BaseRelationship {
  type: "has_one";
  fieldName: string;
}

export interface PdaSeedRelationship extends BaseRelationship {
  type: "pda_seed";
  seedIndex: number;
  instructionName: string;
  isPartial: boolean; // true if not all seeds are known
}

export interface TokenRelationship extends BaseRelationship {
  type: "token";
  tokenType: "mint" | "token_account" | "asset";
}

export interface UserDefinedRelationship extends BaseRelationship {
  type: "user_defined";
  id: string; // unique ID for persistence
  ruleId: string; // which rule generated this
}

export type Relationship =
  | HasOneRelationship
  | PdaSeedRelationship
  | TokenRelationship
  | UserDefinedRelationship;

// --- PDA Relationship Rules ---

export type SeedSource =
  | { kind: "idl_const"; transform?: SeedTransform }                                        // auto-filled from PDA definition
  | { kind: "field"; fieldName: string; transform?: SeedTransform }                         // from source node's decodedData
  | { kind: "source_address"; transform?: SeedTransform }                                   // source node's address as pubkey
  | { kind: "const"; value: string; encoding: BufferEncoding; transform?: SeedTransform };  // user-provided constant

export interface SeedMapping {
  seedIndex: number;
  seed: IdlSeed;         // stored so derivation works without re-fetching IDL
  source: SeedSource;
}

export interface PdaRelationshipRule {
  id: string;
  label: string;
  sourceAccountType: string;   // e.g. "KeyToAssetV0"
  sourceProgram: string;       // program ID for stable matching
  targetPdaName: string;       // human label from PdaDefinition.name
  targetProgramId: string;     // program that owns the PDA
  seedMappings: SeedMapping[];
}

/** @deprecated - kept for backwards compat migration. Use PdaRelationshipRule instead. */
export interface UserRelationshipDef {
  id: string;
  fromAddress: string;
  toAddress: string;
  label: string;
}
