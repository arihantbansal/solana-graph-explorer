import type { Idl } from "@/types/idl";
import {
  getProgramDerivedAddress,
  getAddressEncoder,
  address,
  fetchEncodedAccount,
} from "@solana/kit";
import type { Address } from "@solana/kit";
import { inflateSync } from "fflate";
import { getRpc } from "./rpc";

/**
 * Derive the PDA where the Anchor IDL account lives.
 * Seeds: ["anchor:idl", programId]
 */
export async function deriveIdlAddress(programId: string): Promise<string> {
  const addressEncoder = getAddressEncoder();
  const programAddr = address(programId);
  const programIdBytes = addressEncoder.encode(programAddr);

  const [pda] = await getProgramDerivedAddress({
    programAddress: programAddr,
    seeds: ["anchor:idl", programIdBytes],
  });

  return pda as string;
}

/**
 * Fetch and decode an Anchor IDL from on-chain data.
 *
 * IDL account layout:
 *   8 bytes  - discriminator
 *   32 bytes - authority pubkey
 *   4 bytes  - data_len (u32 LE)
 *   N bytes  - zlib-compressed IDL JSON
 *
 * Total header before compressed data: 44 bytes
 */
export async function fetchIdl(
  programId: string,
  rpcUrl: string,
): Promise<Idl | null> {
  const idlAddress = await deriveIdlAddress(programId);
  const rpc = getRpc(rpcUrl);

  const account = await fetchEncodedAccount(
    rpc,
    address(idlAddress) as Address,
  );

  if (!account.exists) {
    return null;
  }

  const data = account.data as Uint8Array;

  // Skip 8-byte discriminator + 32-byte authority = 40 bytes
  // Read 4-byte data_len
  const dataLenView = new DataView(data.buffer, data.byteOffset + 40, 4);
  const dataLen = dataLenView.getUint32(0, true);

  // Compressed data starts at offset 44
  const compressed = data.slice(44, 44 + dataLen);

  // Decompress
  const decompressed = inflateSync(compressed);
  const jsonStr = new TextDecoder().decode(decompressed);
  const idl: Idl = JSON.parse(jsonStr);

  return idl;
}
