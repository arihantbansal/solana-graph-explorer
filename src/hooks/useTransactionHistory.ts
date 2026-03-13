import { useState, useCallback, useRef, useEffect } from "react";
import type { ParsedTransaction, TransactionFilter } from "@/types/transaction";
import { fetchTransactions, isHeliusEndpoint } from "@/solana/fetchTransactions";

export function useTransactionHistory(address: string | undefined, rpcUrl: string) {
  const [transactions, setTransactions] = useState<ParsedTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [filter, setFilter] = useState<TransactionFilter>({
    timeRange: "all",
    statusFilter: "all",
  });

  const oldestSigRef = useRef<string | undefined>();
  const currentAddressRef = useRef<string | undefined>();

  // Reset state when address changes
  useEffect(() => {
    if (address !== currentAddressRef.current) {
      currentAddressRef.current = address;
      setTransactions([]);
      setError(null);
      setHasMore(false);
      oldestSigRef.current = undefined;
    }
  }, [address]);

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
          if (before) {
            // Append new transactions, deduplicate by signature
            const existingSigs = new Set(prev.map((t) => t.signature));
            const newTxs = page.transactions.filter((t) => !existingSigs.has(t.signature));
            return [...prev, ...newTxs];
          }
          return page.transactions;
        });

        setHasMore(page.hasMore);
        oldestSigRef.current = page.oldestSignature;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to fetch transactions");
      } finally {
        setIsLoading(false);
      }
    },
    [address, rpcUrl],
  );

  const loadMore = useCallback(() => {
    if (oldestSigRef.current) {
      loadTransactions(oldestSigRef.current);
    }
  }, [loadTransactions]);

  // Client-side filtering
  const filteredTransactions = transactions.filter((tx) => {
    // Status filter
    if (filter.statusFilter === "success" && tx.err !== null) return false;
    if (filter.statusFilter === "failed" && tx.err === null) return false;

    // Time range filter (client-side)
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

    // Instruction name filter
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
  };
}
