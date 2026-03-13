import type { HasOneRelationship } from "@/types/relationships";
import type { IdlTypeDef, IdlType, Idl } from "@/types/idl";
import { WELL_KNOWN_PROGRAM_IDS } from "@/utils/wellKnownPrograms";

const ZERO_ADDRESS = "11111111111111111111111111111111";

export function isPubkeyType(type: IdlType): boolean {
  return type === "pubkey" || type === "publicKey";
}

export function inferHasOneRelationships(
  sourceAddress: string,
  decodedData: Record<string, unknown>,
  typeDef: IdlTypeDef,
  _idl?: Idl
): HasOneRelationship[] {
  const relationships: HasOneRelationship[] = [];

  if (typeDef.type.kind !== "struct" || !typeDef.type.fields) {
    return relationships;
  }

  for (const field of typeDef.type.fields) {
    if (!isPubkeyType(field.type)) {
      continue;
    }

    const value = decodedData[field.name];
    if (typeof value !== "string") {
      continue;
    }

    if (WELL_KNOWN_PROGRAM_IDS.has(value)) {
      continue;
    }

    relationships.push({
      sourceAddress,
      targetAddress: value,
      type: "has_one",
      label: field.name,
      fieldName: field.name,
    });
  }

  return relationships;
}

export { ZERO_ADDRESS };
