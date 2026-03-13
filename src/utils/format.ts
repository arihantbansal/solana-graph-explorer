/**
 * Shared formatting utilities used across components.
 */

/** Check if a string value looks like a base58 Solana public key */
export function isPubkey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 32 &&
    value.length <= 44 &&
    /^[1-9A-HJ-NP-Za-km-z]+$/.test(value)
  );
}

/** Convert lamports to SOL with specified decimal precision */
export function lamportsToSol(lamports: number, decimals = 4): string {
  return (lamports / 1_000_000_000).toFixed(decimals);
}

/** Shorten a base58 address for display */
export function shortenAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}
