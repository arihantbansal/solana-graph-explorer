import type { Relationship } from "@/types/relationships";
import type { Idl, IdlTypeDef } from "@/types/idl";
import { inferHasOneRelationships } from "./hasOneInference";
import { inferPdaRelationships } from "./pdaRelationships";
import { inferTokenRelationships } from "./tokenAccountInference";

export interface InferenceInput {
  sourceAddress: string;
  decodedData: Record<string, unknown>;
  typeDef?: IdlTypeDef;
  idl?: Idl;
}

export function inferAllRelationships(input: InferenceInput): Relationship[] {
  const { sourceAddress, decodedData, typeDef, idl } = input;
  const all: Relationship[] = [];

  // has_one inference (requires typeDef)
  if (typeDef && idl) {
    all.push(
      ...inferHasOneRelationships(sourceAddress, decodedData, typeDef, idl)
    );
  }

  // PDA seed inference (requires idl)
  if (idl) {
    all.push(...inferPdaRelationships(sourceAddress, decodedData, idl));
  }

  // Token account inference (always runs)
  all.push(...inferTokenRelationships(sourceAddress, decodedData));

  return deduplicateRelationships(all);
}

function deduplicateRelationships(
  relationships: Relationship[]
): Relationship[] {
  const seen = new Set<string>();
  const result: Relationship[] = [];

  for (const rel of relationships) {
    const key = `${rel.sourceAddress}:${rel.targetAddress}:${rel.type}:${rel.label}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(rel);
    }
  }

  return result;
}
