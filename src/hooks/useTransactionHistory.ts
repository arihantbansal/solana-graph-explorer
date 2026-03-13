import { useState, useCallback, useRef } from "react";
import type { ParsedTransaction, TransactionFilter } from "@/types/transaction";
import { fetchTransactions, isHeliusEndpoint } from "@/solana/fetchTransactions";

interface TxHistoryCache {
  transactions: ParsedTransaction[];
  hasMore: boolean;
  oldestSignature: string | undefined;
  filter: TransactionFilter;
  scrollTop: number;
  lastAccessed: number;
}

const MAX_CACHE_ENTRIES = 20;
const txHistoryCache = new Map<string, TxHistoryCache>();

function evictCache() {
  if (txHistoryCache.size <= MAX_CACHE_ENTRIES) return;
  let oldest: string | null = null;
  let oldestTime = Infinity;
  for (const [key, entry] of txHistoryCache) {
    if (entry.lastAccessed < oldestTime) {
      oldestTime = entry.lastAccessed;
      oldest = key;
    }
  }
  if (oldest) txHistoryCache.delete(oldest);
}

function getCached(address: string | undefined) {
  return address ? txHistoryCache.get(address) : undefined;
}

export function useTransactionHistory(address: string | undefined, rpcUrl: string) {
  const prevAddressRef = useRef(address);
  const oldestSigRef = useRef<string | undefined>(getCached(address)?.oldestSignature);

  const [transactions, setTransactions] = useState<ParsedTransaction[]>(
    getCached(address)?.transactions ?? [],
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(getCached(address)?.hasMore ?? false);
  const [filter, setFilter] = useState<TransactionFilter>(
    getCached(address)?.filter ?? { timeRange: "all", statusFilter: "all" },
  );
  const [scrollTop, setScrollTop] = useState(getCached(address)?.scrollTop ?? 0);

  // Synchronous reset when address changes (no useEffect lag)
  if (address !== prevAddressRef.current) {
    // Save scroll position for the old address before switching
    // (caller updates scrollTop via saveScrollTop, so current state is already up to date)

    prevAddressRef.current = address;
    const entry = getCached(address);
    if (entry) {
      setTransactions(entry.transactions);
      setHasMore(entry.hasMore);
      oldestSigRef.current = entry.oldestSignature;
      setFilter(entry.filter);
      setScrollTop(entry.scrollTop);
      entry.lastAccessed = Date.now();
    } else {
      setTransactions([]);
      setError(null);
      setHasMore(false);
      oldestSigRef.current = undefined;
      setScrollTop(0);
    }
  }

  // Save current state to cache (call when state changes meaningfully)
  const syncToCache = useCallback(
    (txs: ParsedTransaction[], more: boolean, f: TransactionFilter, scroll: number) => {
      if (!address || txs.length === 0) return;
      txHistoryCache.set(address, {
        transactions: txs,
        hasMore: more,
        oldestSignature: oldestSigRef.current,
        filter: f,
        scrollTop: scroll,
        lastAccessed: Date.now(),
      });
      evictCache();
    },
    [address],
  );

  const saveScrollTop = useCallback(
    (top: number) => {
      setScrollTop(top);
      if (address && txHistoryCache.has(address)) {
        txHistoryCache.get(address)!.scrollTop = top;
      }
    },
    [address],
  );

  const loadTransactions = useCallback(
    async (before?: string) => {
      if (!address) return;

      setIsLoading(true);
      setError(null);

      try {
        const page = await fetchTransactions(address, rpcUrl, {
          before,
          limit: 20,
        });

        setTransactions((prev) => {
          const next = before
            ? (() => {
                const existingSigs = new Set(prev.map((t) => t.signature));
                const newTxs = page.transactions.filter((t) => !existingSigs.has(t.signature));
                return [...prev, ...newTxs];
              })()
            : page.transactions;

          // Sync to cache immediately with new data
          syncToCache(next, page.hasMore, filter, scrollTop);
          return next;
        });

        setHasMore(page.hasMore);
        oldestSigRef.current = page.oldestSignature;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to fetch transactions");
      } finally {
        setIsLoading(false);
      }
    },
    [address, rpcUrl, syncToCache, filter, scrollTop],
  );

  const loadMore = useCallback(() => {
    if (oldestSigRef.current) {
      loadTransactions(oldestSigRef.current);
    }
  }, [loadTransactions]);

  // Client-side filtering
  const filteredTransactions = transactions.filter((tx) => {
    if (filter.statusFilter === "success" && tx.err !== null) return false;
    if (filter.statusFilter === "failed" && tx.err === null) return false;

    if (filter.timeRange !== "all" && tx.blockTime) {
      const now = Math.floor(Date.now() / 1000);
      const ranges: Record<string, number> = {
        "1h": 3600,
        "24h": 86400,
        "7d": 604800,
        "30d": 2592000,
      };
      const maxAge = ranges[filter.timeRange];
      if (maxAge && now - tx.blockTime > maxAge) return false;
    }

    if (filter.instructionFilter) {
      const hasMatchingIx = tx.instructions.some(
        (ix) => ix.decoded?.instructionName === filter.instructionFilter,
      );
      if (!hasMatchingIx) return false;
    }

    return true;
  });

  return {
    transactions: filteredTransactions,
    isLoading,
    error,
    filter,
    setFilter,
    hasMore,
    loadMore,
    loadInitial: () => loadTransactions(),
    isHelius: isHeliusEndpoint(),
    scrollTop,
    saveScrollTop,
  };
}
