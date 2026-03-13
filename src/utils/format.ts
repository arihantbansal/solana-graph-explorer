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
export function lamportsToSol(lamports: number | bigint, decimals = 4): string {
  return (Number(lamports) / 1_000_000_000).toFixed(decimals);
}

/** Shorten a base58 address for display */
export function shortenAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/** Format a unix timestamp as a relative time string ("2m ago", "3h ago", "5d ago") */
export function formatRelativeTime(unixTimestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - unixTimestamp;

  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
  return `${Math.floor(diff / 2592000)}mo ago`;
}

/** Format a unix timestamp as a localized date/time string */
export function formatAbsoluteTime(unixTimestamp: number): string {
  return new Date(unixTimestamp * 1000).toLocaleString();
}

/** Check if a string looks like a transaction signature (base58, ~87-88 chars) */
export function isTxSignature(value: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(value);
}
