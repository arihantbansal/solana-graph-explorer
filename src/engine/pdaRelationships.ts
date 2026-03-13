import type { PdaSeedRelationship } from "@/types/relationships";
import type { Idl } from "@/types/idl";

/**
 * Convert a PascalCase or camelCase type name to snake_case for matching
 * against Anchor IDL instruction account names.
 * e.g. "KeyToAssetV0" → "key_to_asset_v0"
 */
function toSnakeCase(name: string): string {
  return name
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .replace(/^_/, "");
}

/**
 * Infer PDA seed relationships for a decoded account.
 *
 * Only creates edges for instructions where the source account matches
 * a PDA account definition — i.e. the source IS the derived PDA, and
 * the edge points to the seed accounts that were used to derive it.
 *
 * @param sourceAccountType - The account type name (e.g. "KeyToAssetV0")
 *   used to scope which PDA definitions apply.
 */
export function inferPdaRelationships(
  sourceAddress: string,
  decodedData: Record<string, unknown>,
  idl: Idl,
  sourceAccountType?: string,
): PdaSeedRelationship[] {
  const relationships: PdaSeedRelationship[] = [];
  const seen = new Set<string>();

  const sourceSnake = sourceAccountType ? toSnakeCase(sourceAccountType) : undefined;

  for (const instruction of idl.instructions) {
    for (const account of instruction.accounts) {
      if (!account.pda?.seeds) {
        continue;
      }

      // Only match PDA accounts whose name corresponds to the source account type.
      // Anchor IDL account names are snake_case versions of the type, sometimes
      // without version suffixes. Match if the PDA account name is a prefix of
      // or equal to the source type's snake_case form.
      if (sourceSnake) {
        const accountSnake = account.name.toLowerCase();
        if (accountSnake !== sourceSnake && !sourceSnake.startsWith(accountSnake + "_")) {
          // Also check without trailing version suffix (e.g., "key_to_asset" matches "key_to_asset_v0")
          const sourceWithoutVersion = sourceSnake.replace(/_v\d+$/, "");
          if (accountSnake !== sourceWithoutVersion) {
            continue;
          }
        }
      }

      const seeds = account.pda.seeds;
      const hasArgSeed = seeds.some((s) => s.kind === "arg");

      for (let seedIndex = 0; seedIndex < seeds.length; seedIndex++) {
        const seed = seeds[seedIndex];

        if (seed.kind !== "account") {
          continue;
        }

        const path = seed.path;
        // Resolve the path against decoded data
        const value = resolvePath(decodedData, path);

        if (typeof value !== "string" || !value) {
          continue;
        }

        const dedupKey = `${sourceAddress}:${value}:pda_seed:${instruction.name}:${seedIndex}`;
        if (seen.has(dedupKey)) {
          continue;
        }
        seen.add(dedupKey);

        relationships.push({
          sourceAddress,
          targetAddress: value,
          type: "pda_seed",
          label: `PDA seed: ${path} (${instruction.name})`,
          seedIndex,
          instructionName: instruction.name,
          isPartial: hasArgSeed,
        });
      }
    }
  }

  return relationships;
}

function resolvePath(
  data: Record<string, unknown>,
  path: string
): unknown {
  const parts = path.split(".");
  let current: unknown = data;

  for (const part of parts) {
    if (current == null || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}
