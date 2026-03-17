import type { Idl } from "@/types/idl";
import {
  getProgramDerivedAddress,
  getAddressEncoder,
  address,
  createAddressWithSeed,
} from "@solana/kit";
import { decompressSync } from "fflate";
import { fetchAccountsBatch } from "./fetchAccounts";
import type { FetchedAccount } from "./fetchAccount";
import { isLegacyFormat, convertLegacyIdl } from "@/engine/legacyIdlConverter";

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
export function parseAnchorIdlAccount(data: Uint8Array, programAddress?: string): Idl {
  const compressed = data.slice(44);
  const decompressed = decompressSync(compressed);
  const jsonStr = new TextDecoder().decode(decompressed);
  const raw = JSON.parse(jsonStr);
  if (isLegacyFormat(raw)) return convertLegacyIdl(raw, programAddress);
  return raw as Idl;
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
export function parseMetadataIdlAccount(data: Uint8Array, programAddress?: string): Idl | null {
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

  const raw = JSON.parse(jsonStr);
  if (isLegacyFormat(raw)) return convertLegacyIdl(raw, programAddress);
  return raw as Idl;
}

/**
 * Try to parse an IDL from already-fetched account data.
 * Tries legacy Anchor format first, then Program Metadata format.
 */
export function tryParseIdlFromAccount(account: FetchedAccount, programAddress?: string): Idl | null {
  try {
    return parseAnchorIdlAccount(account.data, programAddress);
  } catch (err) { console.warn("Failed to parse IDL as legacy Anchor format", err); }
  try {
    return parseMetadataIdlAccount(account.data, programAddress);
  } catch (err) { console.warn("Failed to parse IDL as Program Metadata format", err); }
  return null;
}

/**
 * Fetch and decode an Anchor IDL from on-chain data.
 *
 * Derives both legacy + metadata IDL addresses and fetches them in a single
 * batched getMultipleAccounts call.
 */
export async function fetchIdl(
  programId: string,
  rpcUrl: string,
): Promise<Idl | null> {
  // Derive both addresses in parallel
  const derivations = await Promise.allSettled([
    deriveIdlAddress(programId),
    deriveMetadataIdlAddress(programId),
  ]);

  const addrsToFetch: string[] = [];
  let legacyAddr: string | null = null;
  let metaAddr: string | null = null;

  if (derivations[0].status === "fulfilled") {
    legacyAddr = derivations[0].value;
    addrsToFetch.push(legacyAddr);
  }
  if (derivations[1].status === "fulfilled") {
    metaAddr = derivations[1].value;
    addrsToFetch.push(metaAddr);
  }

  if (addrsToFetch.length === 0) return null;

  // Single batched RPC call for both IDL accounts
  const accountMap = await fetchAccountsBatch(addrsToFetch, rpcUrl);

  // Try legacy first
  if (legacyAddr) {
    const account = accountMap.get(legacyAddr);
    if (account) {
      try {
        return parseAnchorIdlAccount(account.data, programId);
      } catch (err) { console.warn(`Failed to parse legacy Anchor IDL for program ${programId}`, err); }
    }
  }

  // Try metadata
  if (metaAddr) {
    const account = accountMap.get(metaAddr);
    if (account) {
      try {
        return parseMetadataIdlAccount(account.data, programId);
      } catch (err) { console.warn(`Failed to parse metadata IDL for program ${programId}`, err); }
    }
  }

  return null;
}
