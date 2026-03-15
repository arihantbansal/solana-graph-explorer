import { address, fetchEncodedAccount } from "@solana/kit";
import type { Address } from "@solana/kit";
import { getRpc } from "./rpc";
import type { FetchedAccount } from "./fetchAccount";

/**
 * Fetch a raw account by address, bypassing the cache.
 * Used for large accounts (like ProgramData with ELF binary) where
 * caching the full data would waste memory.
 */
export async function fetchAccountUncached(
  accountAddress: string,
  rpcUrl: string,
): Promise<FetchedAccount | null> {
  const rpc = getRpc(rpcUrl);
  const addr = address(accountAddress) as Address;

  const account = await fetchEncodedAccount(rpc, addr);

  if (!account.exists) {
    return null;
  }

  return {
    address: accountAddress,
    data: new Uint8Array(account.data as Uint8Array),
    owner: account.programAddress as string,
    lamports: account.lamports as unknown as bigint,
    executable: account.executable,
    space: account.space,
  };
}
