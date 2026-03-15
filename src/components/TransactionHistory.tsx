import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CopyButton } from "@/components/CopyButton";
import { LoadMoreFooter, BatchSizeSelect, SortOrderToggle, TimeFormatToggle } from "@/components/LoadMoreFooter";
import { useTransactionHistory } from "@/hooks/useTransactionHistory";
import type { TransactionFilter } from "@/types/transaction";
import { History, Loader2, ChevronRight, Calendar } from "lucide-react";
import { useState } from "react";
import { shortenAddress, formatRelativeTime, formatAbsoluteTime } from "@/utils/format";

interface TransactionHistoryProps {
  address: string;
  rpcUrl: string;
  onTransactionClick: (signature: string) => void;
}

function toDateInputValue(ts?: number): string {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  return d.toISOString().slice(0, 16);
}

function fromDateInputValue(val: string): number | undefined {
  if (!val) return undefined;
  const ts = Math.floor(new Date(val).getTime() / 1000);
  return isNaN(ts) ? undefined : ts;
}

export function TransactionHistory({
  address,
  rpcUrl,
  onTransactionClick,
}: TransactionHistoryProps) {
  const {
    allTransactions,
    isLoading,
    error,
    filter,
    setFilter,
    hasMore,
    loadMore,
    loadInitial,
    isHelius,
    pageSize,
    setPageSize,
    totalFiltered,
    sortOrder,
    setSortOrder,
  } = useTransactionHistory(address, rpcUrl);

  const [dateOpen, setDateOpen] = useState(false);
  const [absoluteTime, setAbsoluteTime] = useState(false);

  const hasLoaded = allTransactions.length > 0 || isLoading || error !== null;

  // Collect unique instruction names from ALL loaded transactions for the filter dropdown
  const instructionNames = new Set<string>();
  for (const tx of allTransactions) {
    for (const ix of tx.instructions) {
      if (ix.decoded?.instructionName) {
        instructionNames.add(ix.decoded.instructionName);
      }
    }
  }

  const updateFilter = (partial: Partial<TransactionFilter>) => {
    setFilter((prev) => ({ ...prev, ...partial }));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <History className="size-3.5" />
          Transaction History
        </h4>
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
          <div className="flex flex-wrap gap-2 items-end">
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

          {/* Secondary controls row */}
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <button
              className="flex items-center gap-1 hover:text-foreground"
              onClick={() => setDateOpen(!dateOpen)}
            >
              <Calendar className="size-3" />
              {filter.fromDate || filter.toDate ? "Date filter active" : "Date range"}
              <ChevronRight className={`size-3 transition-transform ${dateOpen ? "rotate-90" : ""}`} />
            </button>
            <span className="text-border">|</span>
            <BatchSizeSelect value={pageSize} onChange={setPageSize} />
            <TimeFormatToggle absolute={absoluteTime} onChange={setAbsoluteTime} />
            {isHelius && (
              <SortOrderToggle sortOrder={sortOrder} onChange={setSortOrder} />
            )}
          </div>
          <div>
            {dateOpen && (
              <div className="flex flex-wrap gap-1.5 items-center text-xs mt-1.5">
                <label className="text-muted-foreground">From</label>
                <input
                  type="datetime-local"
                  className="h-6 px-1 text-[11px] rounded border border-border bg-background text-foreground w-[155px]"
                  value={toDateInputValue(filter.fromDate)}
                  onChange={(e) => updateFilter({ fromDate: fromDateInputValue(e.target.value) })}
                />
                <label className="text-muted-foreground">To</label>
                <input
                  type="datetime-local"
                  className="h-6 px-1 text-[11px] rounded border border-border bg-background text-foreground w-[155px]"
                  value={toDateInputValue(filter.toDate)}
                  onChange={(e) => updateFilter({ toDate: fromDateInputValue(e.target.value) })}
                />
                {(filter.fromDate || filter.toDate) && (
                  <button
                    className="text-[10px] text-muted-foreground hover:text-foreground underline"
                    onClick={() => updateFilter({ fromDate: undefined, toDate: undefined })}
                  >
                    Clear
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Results count */}
          {totalFiltered > 0 && (
            <div className="text-[10px] text-muted-foreground">
              {totalFiltered} transaction{totalFiltered !== 1 ? "s" : ""}
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

          {/* Transaction table */}
          {allTransactions.length > 0 && (
            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left px-2 py-1 font-medium text-muted-foreground">
                      Signature
                    </th>
                    <th className="text-left px-2 py-1 font-medium text-muted-foreground">
                      Time
                    </th>
                    <th className="text-right px-2 py-1 font-medium text-muted-foreground">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {allTransactions.map((tx) => {
                    const isSuccess = tx.err === null;
                    const ixNames: string[] = [];
                    for (const ix of tx.instructions) {
                      if (ix.decoded?.instructionName && !ixNames.includes(ix.decoded.instructionName)) {
                        ixNames.push(ix.decoded.instructionName);
                      }
                    }
                    return (
                      <tr key={tx.signature} className="border-t">
                        <td className="px-2 py-1">
                          <div className="flex items-center gap-1">
                            <button
                              className="font-mono text-blue-500 hover:underline cursor-pointer"
                              onClick={() => onTransactionClick(tx.signature)}
                            >
                              {shortenAddress(tx.signature, 4)}
                            </button>
                            <CopyButton value={tx.signature} iconSize="size-2.5" />
                          </div>
                          {ixNames.length > 0 && (
                            <div className="flex flex-wrap gap-0.5 mt-0.5">
                              {ixNames.map((name) => (
                                <Badge key={name} variant="outline" className="text-[8px] px-1 py-0">
                                  {name}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-1 text-muted-foreground whitespace-nowrap align-top">
                          {tx.blockTime ? (absoluteTime ? formatAbsoluteTime(tx.blockTime) : formatRelativeTime(tx.blockTime)) : "-"}
                        </td>
                        <td className="px-2 py-1 text-right align-top">
                          <Badge
                            variant={isSuccess ? "outline" : "destructive"}
                            className={`text-[9px] px-1.5 py-0 ${isSuccess ? "text-green-600 border-green-600/30 bg-green-500/10" : ""}`}
                          >
                            {isSuccess ? "Success" : "Failed"}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Load More */}
          <LoadMoreFooter isLoading={isLoading} hasMore={hasMore} onLoadMore={loadMore} />

          {/* Empty state */}
          {!isLoading && allTransactions.length === 0 && !error && (
            <div className="text-xs text-muted-foreground text-center py-2">
              No transactions found
            </div>
          )}
        </div>
      )}
    </div>
  );
}
