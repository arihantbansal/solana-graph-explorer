import { useState, useRef } from "react";
import { useAsyncCallback } from "react-async-hook";
import {
  fetchTokenAccounts,
  type TokenAccountInfo,
} from "@/solana/fetchTokenAccounts";

interface TokenBalanceCache {
  data: TokenAccountInfo[];
  timestamp: number;
  lastAccessed: number;
}

const tokenBalanceCache = new Map<string, TokenBalanceCache>();
const MAX_CACHE = 20;
const CACHE_TTL = 60_000; // 1 minute

function evictCache() {
  if (tokenBalanceCache.size <= MAX_CACHE) return;
  let oldest: string | null = null;
  let oldestTime = Infinity;
  for (const [key, entry] of tokenBalanceCache) {
    if (entry.lastAccessed < oldestTime) {
      oldestTime = entry.lastAccessed;
      oldest = key;
    }
  }
  if (oldest) tokenBalanceCache.delete(oldest);
}

function getCached(
  addr: string | undefined,
): TokenBalanceCache | undefined {
  if (!addr) return undefined;
  const entry = tokenBalanceCache.get(addr);
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    tokenBalanceCache.delete(addr);
    return undefined;
  }
  entry.lastAccessed = Date.now();
  return entry;
}

export function useTokenBalances(
  address: string | undefined,
  rpcUrl: string,
) {
  const prevAddressRef = useRef(address);

  const [tokens, setTokens] = useState<TokenAccountInfo[]>(
    getCached(address)?.data ?? [],
  );

  // Synchronous reset when address changes
  if (address !== prevAddressRef.current) {
    prevAddressRef.current = address;
    const entry = getCached(address);
    if (entry) {
      setTokens(entry.data);
    } else {
      setTokens([]);
    }
  }

  const asyncLoad = useAsyncCallback(async () => {
    if (!address) return;

    // Check cache first
    const cached = getCached(address);
    if (cached) {
      setTokens(cached.data);
      return;
    }

    const data = await fetchTokenAccounts(address, rpcUrl);
    setTokens(data);

    // Save to cache
    tokenBalanceCache.set(address, {
      data,
      timestamp: Date.now(),
      lastAccessed: Date.now(),
    });
    evictCache();
  });

  const isLoading = asyncLoad.loading;
  const error = asyncLoad.error?.message ?? (asyncLoad.error ? "Failed to fetch token balances" : null);

  return { tokens, isLoading, error, load: asyncLoad.execute };
}
