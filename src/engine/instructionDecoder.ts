import type { Idl } from "@/types/idl";
import type { ParsedInstruction } from "@/types/transaction";
import { BorshReader, decodeFields } from "@/engine/accountDecoder";
import { getBase58Encoder } from "@solana/kit";

const base58Encoder = getBase58Encoder();

/**
 * Decode an instruction's data using an Anchor IDL.
 * Matches the first 8 bytes of instruction data against IDL instruction discriminators.
 * Returns null if no match found or data is too short.
 */
export function decodeInstruction(
  instruction: ParsedInstruction,
  idl: Idl,
): { instructionName: string; args: Record<string, unknown>; programName?: string } | null {
  if (!instruction.data || !idl.instructions) return null;

  let dataBytes: Uint8Array;
  try {
    dataBytes = new Uint8Array(base58Encoder.encode(instruction.data));
  } catch (err) {
    console.warn("Failed to decode base58 instruction data", err);
    return null;
  }

  // Find instruction with matching discriminator (any length, including 0 for memo)
  const matched = idl.instructions.find(
    (ix) =>
      ix.discriminator &&
      ix.discriminator.length >= 0 &&
      dataBytes.length >= ix.discriminator.length &&
      ix.discriminator.every((b, i) => b === dataBytes[i]),
  );

  if (!matched) return null;

  // Special case: empty discriminator means entire data is a UTF-8 memo string
  if (matched.discriminator.length === 0) {
    const memo = new TextDecoder().decode(dataBytes);
    return {
      instructionName: matched.name,
      args: { memo },
      programName: idl.metadata?.name,
    };
  }

  try {
    const reader = new BorshReader(dataBytes);
    reader.offset = matched.discriminator.length; // skip discriminator
    const args = matched.args.length > 0 ? decodeFields(reader, matched.args, idl) : {};
    return {
      instructionName: matched.name,
      args,
      programName: idl.metadata?.name,
    };
  } catch (err) {
    console.warn("Failed to decode instruction args after discriminator match", err);
    // Discriminator matched but decoding failed — still return the name
    return {
      instructionName: matched.name,
      args: {},
      programName: idl.metadata?.name,
    };
  }
}
