import { useState, useCallback, useRef, useMemo } from "react";
import { useAsyncCallback } from "react-async-hook";
import type { ParsedTransaction, TransactionFilter } from "@/types/transaction";
import { fetchTransactions, isHeliusEndpoint } from "@/solana/fetchTransactions";

interface TxHistoryCache {
  transactions: ParsedTransaction[];
  hasMore: boolean;
  oldestSignature: string | undefined;
  filter: TransactionFilter;
  scrollTop: number;
  lastAccessed: number;
  fetchSize: number;
  sortOrder: "asc" | "desc";
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

interface TxHistoryOptions {
  /** Helius-only: include associated token account transactions */
  tokenAccounts?: "none" | "balanceChanged" | "all";
}

function getCacheKey(address: string | undefined, opts?: TxHistoryOptions) {
  if (!address) return undefined;
  const suffix = opts?.tokenAccounts && opts.tokenAccounts !== "none" ? `:${opts.tokenAccounts}` : "";
  return `${address}${suffix}`;
}

function getCached(address: string | undefined, opts?: TxHistoryOptions) {
  const key = getCacheKey(address, opts);
  return key ? txHistoryCache.get(key) : undefined;
}

export function useTransactionHistory(address: string | undefined, rpcUrl: string, options?: TxHistoryOptions) {
  const prevAddressRef = useRef(address);
  const cacheKey = getCacheKey(address, options);
  const oldestSigRef = useRef<string | undefined>(getCached(address, options)?.oldestSignature);

  const [transactions, setTransactions] = useState<ParsedTransaction[]>(
    getCached(address, options)?.transactions ?? [],
  );
  const [hasMore, setHasMore] = useState(getCached(address, options)?.hasMore ?? false);
  const [filter, setFilter] = useState<TransactionFilter>(
    getCached(address, options)?.filter ?? { statusFilter: "all" },
  );
  const [scrollTop, setScrollTop] = useState(getCached(address, options)?.scrollTop ?? 0);
  const [fetchSize, setFetchSize] = useState(getCached(address, options)?.fetchSize ?? 20);
  const [sortOrder, setSortOrderState] = useState<"asc" | "desc">(
    getCached(address, options)?.sortOrder ?? "desc",
  );
  const sortOrderRef = useRef(sortOrder);

  // Synchronous reset when address changes (no useEffect lag)
  if (address !== prevAddressRef.current) {
    prevAddressRef.current = address;
    const entry = getCached(address, options);
    if (entry) {
      setTransactions(entry.transactions);
      setHasMore(entry.hasMore);
      oldestSigRef.current = entry.oldestSignature;
      setFilter(entry.filter);
      setScrollTop(entry.scrollTop);
      setFetchSize(entry.fetchSize);
      setSortOrderState(entry.sortOrder);
      sortOrderRef.current = entry.sortOrder;
      entry.lastAccessed = Date.now();
    } else {
      setTransactions([]);
      setHasMore(false);
      oldestSigRef.current = undefined;
      setScrollTop(0);
      setFetchSize(20);
      setSortOrderState("desc");
      sortOrderRef.current = "desc";
    }
  }

  // Save current state to cache
  const syncToCache = useCallback(
    (txs: ParsedTransaction[], more: boolean, f: TransactionFilter, scroll: number) => {
      if (!cacheKey || txs.length === 0) return;
      txHistoryCache.set(cacheKey, {
        transactions: txs,
        hasMore: more,
        oldestSignature: oldestSigRef.current,
        filter: f,
        scrollTop: scroll,
        lastAccessed: Date.now(),
        fetchSize,
        sortOrder,
      });
      evictCache();
    },
    [cacheKey, fetchSize, sortOrder],
  );

  const saveScrollTop = useCallback(
    (top: number) => {
      setScrollTop(top);
      if (cacheKey && txHistoryCache.has(cacheKey)) {
        txHistoryCache.get(cacheKey)!.scrollTop = top;
      }
    },
    [cacheKey],
  );

  const loadTransactionsAction = useAsyncCallback(
    async (before?: string) => {
      if (!address) return;

      const page = await fetchTransactions(address, rpcUrl, {
        before,
        limit: fetchSize,
        sortOrder: sortOrderRef.current,
        tokenAccounts: options?.tokenAccounts,
      });

      setTransactions((prev) => {
        const next = before
          ? (() => {
              const existingSigs = new Set(prev.map((t) => t.signature));
              const newTxs = page.transactions.filter((t) => !existingSigs.has(t.signature));
              return [...prev, ...newTxs];
            })()
          : page.transactions;

        syncToCache(next, page.hasMore, filter, scrollTop);
        return next;
      });

      setHasMore(page.hasMore);
      oldestSigRef.current = page.oldestSignature;
    },
  );

  const loadMore = useCallback(() => {
    if (oldestSigRef.current) {
      loadTransactionsAction.execute(oldestSigRef.current);
    }
  }, [loadTransactionsAction]);

  // Client-side filtering
  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      if (filter.statusFilter === "success" && tx.err !== null) return false;
      if (filter.statusFilter === "failed" && tx.err === null) return false;

      if (tx.blockTime) {
        if (filter.fromDate && tx.blockTime < filter.fromDate) return false;
        if (filter.toDate && tx.blockTime > filter.toDate) return false;
      }

      if (filter.instructionFilter) {
        const hasMatchingIx = tx.instructions.some(
          (ix) => ix.decoded?.instructionName === filter.instructionFilter,
        );
        if (!hasMatchingIx) return false;
      }

      return true;
    });
  }, [transactions, filter]);

  const setPageSize = useCallback((size: number) => {
    setFetchSize(size);
  }, []);

  const setSortOrder = useCallback((order: "asc" | "desc") => {
    if (order === sortOrder) return;
    setSortOrderState(order);
    sortOrderRef.current = order;
    setTransactions([]);
    setHasMore(false);
    oldestSigRef.current = undefined;
    if (cacheKey) txHistoryCache.delete(cacheKey);
    loadTransactionsAction.execute();
  }, [sortOrder, cacheKey, loadTransactionsAction]);

  return {
    allTransactions: filteredTransactions,
    isLoading: loadTransactionsAction.loading,
    error: loadTransactionsAction.error ? (loadTransactionsAction.error instanceof Error ? loadTransactionsAction.error.message : "Failed to fetch transactions") : null,
    filter,
    setFilter,
    hasMore,
    loadMore,
    loadInitial: () => loadTransactionsAction.execute(),
    isHelius: isHeliusEndpoint(),
    scrollTop,
    saveScrollTop,
    pageSize: fetchSize,
    setPageSize,
    totalFiltered: filteredTransactions.length,
    sortOrder,
    setSortOrder,
  };
}
