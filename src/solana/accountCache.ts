import type { FetchedAccount } from "./fetchAccount";

// null = confirmed not found, undefined/absent = never fetched
const cache = new Map<string, FetchedAccount | null>();

export function getCachedAccount(address: string): FetchedAccount | null | undefined {
  if (!cache.has(address)) return undefined;
  return cache.get(address) ?? null;
}

export function setCachedAccount(address: string, account: FetchedAccount | null): void {
  cache.set(address, account);
}

export function hasCachedAccount(address: string): boolean {
  return cache.has(address);
}

export function clearAccountCache(): void {
  cache.clear();
}
