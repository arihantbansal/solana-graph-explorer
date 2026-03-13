import { address, fetchEncodedAccount } from "@solana/kit";
import type { Address } from "@solana/kit";
import { getRpc } from "./rpc";
import { hasCachedAccount, getCachedAccount, setCachedAccount } from "./accountCache";

export interface FetchedAccount {
  address: string;
  data: Uint8Array;
  owner: string;
  lamports: bigint;
  executable: boolean;
  space: bigint;
}

/**
 * Fetch a raw account by address using @solana/kit's RPC.
 * Returns null if the account does not exist.
 * Results are cached — repeated calls for the same address skip RPC.
 */
export async function fetchAccount(
  accountAddress: string,
  rpcUrl: string,
): Promise<FetchedAccount | null> {
  if (hasCachedAccount(accountAddress)) {
    return getCachedAccount(accountAddress) ?? null;
  }

  const rpc = getRpc(rpcUrl);
  const addr = address(accountAddress) as Address;

  const account = await fetchEncodedAccount(rpc, addr);

  if (!account.exists) {
    setCachedAccount(accountAddress, null);
    return null;
  }

  const result: FetchedAccount = {
    address: accountAddress,
    data: new Uint8Array(account.data as Uint8Array),
    owner: account.programAddress as string,
    lamports: account.lamports as unknown as bigint,
    executable: account.executable,
    space: account.space,
  };
  setCachedAccount(accountAddress, result);
  return result;
}
