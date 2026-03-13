import { address, fetchEncodedAccounts } from "@solana/kit";
import type { Address } from "@solana/kit";
import { getRpc } from "./rpc";
import type { FetchedAccount } from "./fetchAccount";
import { hasCachedAccount, getCachedAccount, setCachedAccount } from "./accountCache";

const CHUNK_SIZE = 100;

/**
 * Batch-fetch multiple accounts, using the cache for already-fetched addresses.
 * Uncached addresses are fetched via getMultipleAccounts in chunks of 100.
 */
export async function fetchAccountsBatch(
  addresses: string[],
  rpcUrl: string,
): Promise<Map<string, FetchedAccount | null>> {
  const results = new Map<string, FetchedAccount | null>();

  // Split into cached vs uncached
  const uncached: string[] = [];
  for (const addr of addresses) {
    if (hasCachedAccount(addr)) {
      results.set(addr, getCachedAccount(addr) ?? null);
    } else {
      uncached.push(addr);
    }
  }

  if (uncached.length === 0) return results;

  // Chunk uncached into groups of 100
  const rpc = getRpc(rpcUrl);
  for (let i = 0; i < uncached.length; i += CHUNK_SIZE) {
    const chunk = uncached.slice(i, i + CHUNK_SIZE);
    const solAddresses = chunk.map((a) => address(a) as Address);
    const accounts = await fetchEncodedAccounts(rpc, solAddresses);

    for (let j = 0; j < chunk.length; j++) {
      const addr = chunk[j];
      const account = accounts[j];

      if (!account.exists) {
        setCachedAccount(addr, null);
        results.set(addr, null);
      } else {
        const fetched: FetchedAccount = {
          address: addr,
          data: new Uint8Array(account.data as Uint8Array),
          owner: account.programAddress as string,
          lamports: account.lamports as unknown as bigint,
          executable: account.executable,
          space: account.space,
        };
        setCachedAccount(addr, fetched);
        results.set(addr, fetched);
      }
    }
  }

  return results;
}
