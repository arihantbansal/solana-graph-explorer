/**
 * Shared map of well-known Solana program addresses to human-readable names.
 */
const WELL_KNOWN_PROGRAMS = new Map<string, string>([
  ["11111111111111111111111111111111", "System Program"],
  ["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "Token Program"],
  ["TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb", "Token-2022"],
  ["ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL", "Associated Token Account"],
  ["ComputeBudget111111111111111111111111111111", "Compute Budget"],
  ["SysvarRent111111111111111111111111111111111", "Rent Sysvar"],
  ["SysvarC1ock11111111111111111111111111111111", "Clock Sysvar"],
  ["SysvarS1otHashes111111111111111111111111111", "Slot Hashes Sysvar"],
  ["SysvarStakeHistory1111111111111111111111111", "Stake History Sysvar"],
  ["SysvarRecentB1teleading1111111111111111111111", "Recent Blockhashes Sysvar"],
  ["Vote111111111111111111111111111111111111111", "Vote Program"],
  ["Stake11111111111111111111111111111111111111", "Stake Program"],
  ["BPFLoaderUpgradeab1e11111111111111111111111", "BPF Upgradeable Loader"],
  ["metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s", "Metaplex Token Metadata"],
  ["auth9SigNpDKz4sJJ1DfCTuZrZNSAgh9sFD3rboVmgg", "Metaplex Authorization Rules"],
  ["cndy3Z4yapfJBmL3ShUp5exZKqR3z33thTFLNkBLC3C", "Metaplex Candy Machine v2"],
  ["Guard1JwRhJkVH6XZhzoYxeBVQe872VH6QggF4BWmS9g", "Metaplex Candy Guard"],
  ["whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc", "Orca Whirlpool"],
  ["675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8", "Raydium AMM"],
  ["CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK", "Raydium CLMM"],
  ["JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4", "Jupiter v6"],
  ["MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr", "Memo Program v2"],
  ["Memo1UhkJBfCR961EnqcN1G1MYjyMzmz9h8x2DSTG9K", "Memo Program v1"],
]);

/** Look up a well-known program name by address, or return undefined. */
export function getWellKnownName(address: string): string | undefined {
  return WELL_KNOWN_PROGRAMS.get(address);
}

/** The set of addresses known to be programs (for filtering in has_one inference). */
export const WELL_KNOWN_PROGRAM_IDS = new Set(WELL_KNOWN_PROGRAMS.keys());
