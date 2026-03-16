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

  // Flatten all instruction accounts with PDA seeds that match the source type
  const matchingAccounts = idl.instructions.flatMap((instruction) =>
    instruction.accounts
      .filter((account) => {
        if (!account.pda?.seeds) return false;
        if (!sourceSnake) return true;
        const accountSnake = account.name.toLowerCase();
        const sourceWithoutVersion = sourceSnake.replace(/_v\d+$/, "");
        return (
          accountSnake === sourceSnake ||
          sourceSnake.startsWith(accountSnake + "_") ||
          accountSnake === sourceWithoutVersion
        );
      })
      .map((account) => ({ instruction, account, seeds: account.pda!.seeds })),
  );

  return matchingAccounts.flatMap(({ instruction, seeds }) => {
    const hasArgSeed = seeds.some((s) => s.kind === "arg");

    return seeds
      .map((seed, seedIndex) => ({ seed, seedIndex }))
      .filter(({ seed }) => seed.kind === "account")
      .map(({ seed, seedIndex }) => {
        const value = resolvePath(decodedData, seed.path);
        return { seed, seedIndex, value };
      })
      .filter(({ value }): value is { seed: typeof seeds[0]; seedIndex: number; value: string } =>
        typeof value === "string" && !!value,
      )
      .filter(({ value, seedIndex }) => {
        const dedupKey = `${sourceAddress}:${value}:pda_seed:${instruction.name}:${seedIndex}`;
        if (seen.has(dedupKey)) return false;
        seen.add(dedupKey);
        return true;
      })
      .map(({ seed, seedIndex, value }) => ({
        sourceAddress,
        targetAddress: value,
        type: "pda_seed" as const,
        label: `PDA seed: ${seed.path} (${instruction.name})`,
        seedIndex,
        instructionName: instruction.name,
        isPartial: hasArgSeed,
      }));
  });
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
