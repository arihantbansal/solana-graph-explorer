import type { PdaSeedRelationship } from "@/types/relationships";
import type { Idl } from "@/types/idl";

export function inferPdaRelationships(
  sourceAddress: string,
  decodedData: Record<string, unknown>,
  idl: Idl
): PdaSeedRelationship[] {
  const relationships: PdaSeedRelationship[] = [];
  const seen = new Set<string>();

  for (const instruction of idl.instructions) {
    for (const account of instruction.accounts) {
      if (!account.pda?.seeds) {
        continue;
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
