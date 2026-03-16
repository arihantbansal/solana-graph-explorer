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
  if (typeDef.type.kind !== "struct" || !typeDef.type.fields) {
    return [];
  }

  return typeDef.type.fields
    .filter((field) => isPubkeyType(field.type))
    .map((field) => ({ field, value: decodedData[field.name] }))
    .filter(
      ({ value }) =>
        typeof value === "string" && !WELL_KNOWN_PROGRAM_IDS.has(value),
    )
    .map(({ field, value }) => ({
      sourceAddress,
      targetAddress: value as string,
      type: "has_one" as const,
      label: field.name,
      fieldName: field.name,
    }));
}

export { ZERO_ADDRESS };
