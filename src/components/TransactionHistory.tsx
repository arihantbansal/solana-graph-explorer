import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TransactionRow } from "@/components/TransactionRow";
import { useTransactionHistory } from "@/hooks/useTransactionHistory";
import type { TransactionFilter } from "@/types/transaction";
import { History, Loader2, Clock, CalendarDays } from "lucide-react";
import { useState, useMemo, useCallback } from "react";

interface TransactionHistoryProps {
  address: string;
  rpcUrl: string;
  onTransactionClick: (signature: string) => void;
}

export function TransactionHistory({
  address,
  rpcUrl,
  onTransactionClick,
}: TransactionHistoryProps) {
  const {
    transactions,
    isLoading,
    error,
    filter,
    setFilter,
    hasMore,
    loadMore,
    loadInitial,
    isHelius,
  } = useTransactionHistory(address, rpcUrl);

  const [showAbsoluteTime, setShowAbsoluteTime] = useState(false);
  const hasLoaded = transactions.length > 0 || isLoading || error !== null;

  // Collect unique instruction names from loaded transactions for the filter dropdown
  const instructionNames = useMemo(() => {
    const names = new Set<string>();
    for (const tx of transactions) {
      for (const ix of tx.instructions) {
        if (ix.decoded?.instructionName) {
          names.add(ix.decoded.instructionName);
        }
      }
    }
    return names;
  }, [transactions]);

  const updateFilter = useCallback(
    (partial: Partial<TransactionFilter>) => {
      setFilter((prev) => ({ ...prev, ...partial }));
    },
    [],
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <History className="size-3.5" />
          Transaction History
        </h4>
        {hasLoaded && (
          <button
            className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded"
            onClick={() => setShowAbsoluteTime((v) => !v)}
            title={showAbsoluteTime ? "Show relative times" : "Show absolute times"}
          >
            {showAbsoluteTime ? <Clock className="size-3.5" /> : <CalendarDays className="size-3.5" />}
          </button>
        )}
      </div>

      {!hasLoaded ? (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={loadInitial}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="size-3.5 mr-1 animate-spin" />
              Loading...
            </>
          ) : (
            "Load Transaction History"
          )}
        </Button>
      ) : (
        <div className="space-y-2">
          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            {/* Status filter */}
            <Select
              value={filter.statusFilter}
              onValueChange={(v) =>
                updateFilter({ statusFilter: v as TransactionFilter["statusFilter"] })
              }
            >
              <SelectTrigger className="h-7 text-xs w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>

            {/* Time range filter (only on Helius or for client-side filtering) */}
            <Select
              value={filter.timeRange}
              onValueChange={(v) =>
                updateFilter({ timeRange: v as TransactionFilter["timeRange"] })
              }
            >
              <SelectTrigger className="h-7 text-xs w-[90px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All time</SelectItem>
                <SelectItem value="1h">1 hour</SelectItem>
                <SelectItem value="24h">24 hours</SelectItem>
                <SelectItem value="7d">7 days</SelectItem>
                <SelectItem value="30d">30 days</SelectItem>
              </SelectContent>
            </Select>

            {/* Instruction filter */}
            {instructionNames.size > 0 && (
              <Select
                value={filter.instructionFilter || "__all__"}
                onValueChange={(v) =>
                  updateFilter({
                    instructionFilter: v === "__all__" ? undefined : v,
                  })
                }
              >
                <SelectTrigger className="h-7 text-xs w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All instructions</SelectItem>
                  {Array.from(instructionNames)
                    .sort()
                    .map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Results count */}
          {transactions.length > 0 && (
            <div className="text-[10px] text-muted-foreground">
              {transactions.length} transaction{transactions.length !== 1 ? "s" : ""}
              {isHelius && (
                <Badge variant="outline" className="text-[8px] px-1 py-0 ml-1.5">
                  Helius
                </Badge>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
              {error}
            </div>
          )}

          {/* Transaction list */}
          <div className="space-y-1">
            {transactions.map((tx) => (
              <TransactionRow
                key={tx.signature}
                transaction={tx}
                onClick={onTransactionClick}
                showAbsoluteTime={showAbsoluteTime}
              />
            ))}
          </div>

          {/* Loading indicator */}
          {isLoading && (
            <div className="flex items-center justify-center py-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 mr-1 animate-spin" />
              Loading transactions...
            </div>
          )}

          {/* Load More */}
          {hasMore && !isLoading && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={loadMore}
            >
              Load More
            </Button>
          )}

          {/* Empty state */}
          {!isLoading && transactions.length === 0 && !error && (
            <div className="text-xs text-muted-foreground text-center py-2">
              No transactions found
            </div>
          )}
        </div>
      )}
    </div>
  );
}
