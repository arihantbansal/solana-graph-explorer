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

  // Need at least 8 bytes for the discriminator
  if (dataBytes.length < 8) return null;

  const matched = idl.instructions.find(
    (ix) =>
      ix.discriminator?.length === 8 &&
      ix.discriminator.every((b, i) => b === dataBytes[i]),
  );

  if (!matched) return null;

  try {
    const reader = new BorshReader(dataBytes);
    reader.offset = 8; // skip discriminator
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
