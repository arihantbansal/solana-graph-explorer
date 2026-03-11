import { deflateSync } from "fflate";
import type { Idl } from "@/types/idl";

/**
 * A minimal IDL for testing compression/decompression.
 */
export const sampleIdl: Idl = {
  address: "SampLE1111111111111111111111111111111111111",
  metadata: {
    name: "sample_program",
    version: "0.1.0",
    spec: "0.1.0",
  },
  instructions: [
    {
      name: "initialize",
      discriminator: [0, 1, 2, 3, 4, 5, 6, 7],
      accounts: [],
      args: [],
    },
  ],
  accounts: [
    {
      name: "myAccount",
      discriminator: [10, 20, 30, 40, 50, 60, 70, 80],
    },
  ],
  types: [
    {
      name: "myAccount",
      type: {
        kind: "struct",
        fields: [
          { name: "value", type: "u64" },
        ],
      },
    },
  ],
};

/**
 * The same IDL but in legacy format (no metadata.spec).
 */
export const legacyIdl: Idl = {
  metadata: {
    name: "legacy_program",
    version: "0.0.1",
  },
  name: "legacy_program",
  version: "0.0.1",
  instructions: [],
  accounts: [],
  types: [],
};

/**
 * Compress an IDL to a zlib blob, as it would appear on-chain.
 */
export function compressIdl(idl: Idl): Uint8Array {
  const jsonStr = JSON.stringify(idl);
  const jsonBytes = new TextEncoder().encode(jsonStr);
  return deflateSync(jsonBytes);
}

/**
 * Build a fake on-chain IDL account data buffer:
 *   8 bytes discriminator (zeros)
 *   32 bytes authority (zeros)
 *   4 bytes data_len (u32 LE)
 *   N bytes compressed IDL
 */
export function buildIdlAccountData(idl: Idl): Uint8Array {
  const compressed = compressIdl(idl);
  const total = 8 + 32 + 4 + compressed.length;
  const buf = new Uint8Array(total);

  // Write data_len at offset 40
  new DataView(buf.buffer).setUint32(40, compressed.length, true);

  // Write compressed data at offset 44
  buf.set(compressed, 44);

  return buf;
}

export const sampleIdlAccountData = buildIdlAccountData(sampleIdl);
export const legacyIdlAccountData = buildIdlAccountData(legacyIdl);
export const compressedSampleIdl = compressIdl(sampleIdl);
