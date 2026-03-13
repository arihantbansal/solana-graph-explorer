import type { PdaRelationshipRule, SeedMapping } from "@/types/relationships";
import type { AccountNodeData } from "@/types/graph";
import type { SeedInputValue } from "@/types/pdaExplorer";
import { buildSeedBuffers } from "@/engine/pdaDeriver";
import { getProgramDerivedAddress, address } from "@solana/kit";

/**
 * Resolve seed mappings for a PDA rule against a node's data.
 * Returns SeedInputValue[] if all required fields are available, or null if not.
 */
export function resolveSeedMappings(
  rule: PdaRelationshipRule,
  nodeData: AccountNodeData,
): SeedInputValue[] | null {
  const result: SeedInputValue[] = [];

  for (const mapping of rule.seedMappings) {
    const resolved = resolveSingleMapping(mapping, nodeData);
    if (resolved === null) return null;
    result.push(resolved);
  }

  return result;
}

function resolveSingleMapping(
  mapping: SeedMapping,
  nodeData: AccountNodeData,
): SeedInputValue | null {
  const { seed, source } = mapping;

  switch (source.kind) {
    case "idl_const":
      return { seed, value: "", transform: source.transform };

    case "field": {
      const fieldValue = nodeData.decodedData?.[source.fieldName];
      if (fieldValue === undefined || fieldValue === null) return null;

      // If the field value is a Uint8Array, encode it as hex for the seed
      if (fieldValue instanceof Uint8Array) {
        const hex = Array.from(fieldValue)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        return { seed, value: hex, bufferEncoding: "hex", transform: source.transform };
      }

      return { seed, value: String(fieldValue), transform: source.transform };
    }

    case "source_address":
      return { seed, value: nodeData.address, transform: source.transform };

    case "const":
      return {
        seed,
        value: source.value,
        bufferEncoding: source.encoding,
        transform: source.transform,
      };
  }
}

/**
 * Derive a PDA address from a rule and a source node's data.
 * Returns the derived address string, or null if seed resolution fails.
 */
export async function derivePdaFromRule(
  rule: PdaRelationshipRule,
  nodeData: AccountNodeData,
): Promise<string | null> {
  const seedInputs = resolveSeedMappings(rule, nodeData);
  if (!seedInputs) return null;

  try {
    const seedBuffers = await buildSeedBuffers(seedInputs);
    const programAddr = address(rule.targetProgramId);

    const [pda] = await getProgramDerivedAddress({
      programAddress: programAddr,
      seeds: seedBuffers,
    });

    return pda as string;
  } catch {
    return null;
  }
}
