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
  } catch {
    return null;
  }

  // Need at least 8 bytes for the discriminator
  if (dataBytes.length < 8) return null;

  for (const ix of idl.instructions) {
    const disc = ix.discriminator;
    if (!disc || disc.length !== 8) continue;

    let match = true;
    for (let i = 0; i < 8; i++) {
      if (dataBytes[i] !== disc[i]) {
        match = false;
        break;
      }
    }

    if (match) {
      try {
        const reader = new BorshReader(dataBytes);
        reader.offset = 8; // skip discriminator
        const args = ix.args.length > 0 ? decodeFields(reader, ix.args, idl) : {};
        return {
          instructionName: ix.name,
          args,
          programName: idl.metadata?.name,
        };
      } catch {
        // Discriminator matched but decoding failed — still return the name
        return {
          instructionName: ix.name,
          args: {},
          programName: idl.metadata?.name,
        };
      }
    }
  }

  return null;
}
