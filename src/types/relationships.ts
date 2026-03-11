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
}

export type Relationship =
  | HasOneRelationship
  | PdaSeedRelationship
  | TokenRelationship
  | UserDefinedRelationship;

export interface UserRelationshipDef {
  id: string;
  fromAddress: string;
  toAddress: string;
  label: string;
}
