import type { Idl } from "@/types/idl";
import {
  getProgramDerivedAddress,
  getAddressEncoder,
  address,
  createAddressWithSeed,
  fetchEncodedAccount,
} from "@solana/kit";
import type { Address } from "@solana/kit";
import { decompressSync } from "fflate";
import { getRpc } from "./rpc";

/**
 * Derive the legacy Anchor IDL account address.
 *
 * Two-step derivation:
 *   1. base = PDA([], programId)
 *   2. idlAddress = createWithSeed(base, "anchor:idl", programId)
 */
export async function deriveIdlAddress(programId: string): Promise<string> {
  const programAddr = address(programId);

  const [base] = await getProgramDerivedAddress({
    programAddress: programAddr,
    seeds: [],
  });

  const idlAddr = await createAddressWithSeed({
    baseAddress: address(base),
    seed: "anchor:idl",
    programAddress: programAddr,
  });

  return idlAddr as string;
}

/**
 * Derive the Program Metadata IDL account address.
 *
 * Seeds: [programId, "idl"], program = ProgM6JCCvbYkfKqJYHePx4xxSUSqJp7rh8Lyv7nk7S
 */
const PROGRAM_METADATA_ID = "ProgM6JCCvbYkfKqJYHePx4xxSUSqJp7rh8Lyv7nk7S";

export async function deriveMetadataIdlAddress(
  programId: string,
): Promise<string> {
  const enc = getAddressEncoder();
  const programBytes = enc.encode(address(programId));

  const [pda] = await getProgramDerivedAddress({
    programAddress: address(PROGRAM_METADATA_ID),
    seeds: [programBytes, "idl"],
  });

  return pda as string;
}

/**
 * Parse compressed IDL data from an Anchor IDL account.
 *
 * Legacy Anchor IDL account layout:
 *   8 bytes  - discriminator
 *   32 bytes - authority pubkey
 *   4 bytes  - data_len (u32 LE)
 *   N bytes  - compressed IDL JSON (zlib or raw deflate)
 *
 * Total header before compressed data: 44 bytes
 */
function parseAnchorIdlAccount(data: Uint8Array): Idl {
  const compressed = data.slice(44);
  const decompressed = decompressSync(compressed);
  const jsonStr = new TextDecoder().decode(decompressed);
  return JSON.parse(jsonStr) as Idl;
}

/**
 * Parse IDL data from a Program Metadata account.
 *
 * Program Metadata account layout:
 *   1 byte   - account type discriminator
 *   1 byte   - data encoding (0 = raw UTF-8, 1 = zlib)
 *   4 bytes  - data_len (u32 LE)
 *   2 bytes  - padding / reserved
 *   32 bytes - authority
 *   32 bytes - program key
 *   N bytes  - data payload
 */
function parseMetadataIdlAccount(data: Uint8Array): Idl | null {
  if (data.length < 72) return null;

  const encoding = data[1];

  const payload = data.slice(72);

  let jsonStr: string;
  if (encoding === 1) {
    const decompressed = decompressSync(payload);
    jsonStr = new TextDecoder().decode(decompressed);
  } else {
    jsonStr = new TextDecoder().decode(payload);
  }

  return JSON.parse(jsonStr) as Idl;
}

/**
 * Fetch and decode an Anchor IDL from on-chain data.
 *
 * Tries two sources in order:
 *   1. Legacy Anchor IDL account (createWithSeed derivation)
 *   2. Program Metadata IDL account (new standard)
 */
export async function fetchIdl(
  programId: string,
  rpcUrl: string,
): Promise<Idl | null> {
  const rpc = getRpc(rpcUrl);

  // Try legacy Anchor IDL first
  try {
    const idlAddr = await deriveIdlAddress(programId);
    const account = await fetchEncodedAccount(
      rpc,
      address(idlAddr) as Address,
    );
    if (account.exists) {
      return parseAnchorIdlAccount(account.data as Uint8Array);
    }
  } catch {
    // Legacy derivation failed — try metadata
  }

  // Try Program Metadata IDL
  try {
    const metaAddr = await deriveMetadataIdlAddress(programId);
    const account = await fetchEncodedAccount(
      rpc,
      address(metaAddr) as Address,
    );
    if (account.exists) {
      return parseMetadataIdlAccount(account.data as Uint8Array);
    }
  } catch {
    // Metadata derivation failed
  }

  return null;
}
