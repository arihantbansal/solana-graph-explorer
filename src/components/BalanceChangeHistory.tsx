import { useState, useEffect, useMemo, useRef } from "react";
import { useTransactionHistory } from "@/hooks/useTransactionHistory";
import { useTokenBalances } from "@/hooks/useTokenBalances";
import {
  computeBalanceChanges,
  computeTokenBalanceChanges,
} from "@/engine/transactionDecoder";
import { shortenAddress, formatRelativeTime, formatAbsoluteTime, lamportsToSol } from "@/utils/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/CopyButton";
import { LoadMoreFooter } from "@/components/LoadMoreFooter";
import { HistoryControls } from "@/components/HistoryControls";
import { detectAsset, type DasAssetInfo } from "@/engine/assetDetection";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSettings } from "@/contexts/SettingsContext";
import type { ParsedTransaction } from "@/types/transaction";

interface BalanceChangeHistoryProps {
  address: string;
  rpcUrl: string;
  onTransactionClick: (signature: string) => void;
}

type MintFilter = "all" | "sol" | "spl";

interface ChangeRow {
  signature: string;
  blockTime: number | null;
  type: "sol" | "spl";
  delta: number | bigint;
  postBalance: number | bigint;
  mint?: string;
  decimals?: number;
  instructionNames: string[];
  err: unknown | null;
}

function getInstructionNames(tx: ParsedTransaction): string[] {
  const names: string[] = [];
  for (const ix of tx.instructions) {
    if (ix.decoded?.instructionName && !names.includes(ix.decoded.instructionName)) {
      names.push(ix.decoded.instructionName);
    }
  }
  return names;
}

export function BalanceChangeHistory({
  address,
  rpcUrl,
  onTransactionClick,
}: BalanceChangeHistoryProps) {
  const { getLabel } = useSettings();

  // Main wallet tx history — with balanceChanged to include ATA txs on Helius
  const mainHistory = useTransactionHistory(address, rpcUrl, { tokenAccounts: "balanceChanged" });

  // Token accounts for the mint picker
  const tokenBalances = useTokenBalances(address, rpcUrl);

  const [mintFilter, setMintFilter] = useState<MintFilter>("all");
  const [selectedMint, setSelectedMint] = useState<string | null>(null);
  const [assetInfos, setAssetInfos] = useState<Map<string, DasAssetInfo | null>>(new Map());
  const [mintSearch, setMintSearch] = useState("");
  const [mintDropdownOpen, setMintDropdownOpen] = useState(false);
  const mintSearchRef = useRef<HTMLDivElement>(null);

  // Date range filter (local to balance changes, separate from tx history filter)
  const [fromDate, setFromDate] = useState<number | undefined>();
  const [toDate, setToDate] = useState<number | undefined>();
  const [dateOpen, setDateOpen] = useState(false);
  const [absoluteTime, setAbsoluteTime] = useState(false);


  // Find the ATA address for the selected mint from token balances
  const selectedAta = useMemo(() => {
    if (!selectedMint) return undefined;
    const token = tokenBalances.tokens.find((t) => t.mint === selectedMint);
    return token?.address;
  }, [selectedMint, tokenBalances.tokens]);

  // ATA tx history — fetched when a specific mint is selected
  const ataHistory = useTransactionHistory(selectedAta, rpcUrl);

  const loadedRef = useRef(false);

  // Auto-fetch main history on mount
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    mainHistory.loadInitial();
  }, [mainHistory.loadInitial]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset when address changes
  useEffect(() => {
    loadedRef.current = false;
  }, [address]);

  // Fetch token balances when SPL is first selected (for the mint picker)
  const tokensFetchedRef = useRef(false);
  useEffect(() => {
    if (mintFilter === "spl" && !tokensFetchedRef.current) {
      tokensFetchedRef.current = true;
      tokenBalances.load();
    }
  }, [mintFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-load ATA tx history when a mint is selected and ATA is known
  useEffect(() => {
    if (selectedAta && ataHistory.allTransactions.length === 0 && !ataHistory.isLoading) {
      ataHistory.loadInitial();
    }
  }, [selectedAta]); // eslint-disable-line react-hooks/exhaustive-deps

  // Extract SOL + SPL change rows from main history
  // With Helius balanceChanged, mainHistory includes ATA transactions too
  const { solRows, splRowsFromMain, allMints } = useMemo(() => {
    const sol: ChangeRow[] = [];
    const spl: ChangeRow[] = [];
    const mints = new Set<string>();
    for (const tx of mainHistory.allTransactions) {
      const ixNames = getInstructionNames(tx);
      // SOL changes
      for (const c of computeBalanceChanges(tx)) {
        if (c.address === address) {
          sol.push({
            signature: tx.signature,
            blockTime: tx.blockTime,
            type: "sol",
            delta: c.delta,
            postBalance: c.postBalance,
            instructionNames: ixNames,
            err: tx.err,
          });
        }
      }
      // SPL token changes (available when Helius balanceChanged is active)
      for (const c of computeTokenBalanceChanges(tx)) {
        // Match any ATA owned by this address
        if (c.owner === address) {
          mints.add(c.mint);
          spl.push({
            signature: tx.signature,
            blockTime: tx.blockTime,
            type: "spl",
            delta: c.delta,
            postBalance: c.postAmount,
            mint: c.mint,
            decimals: c.decimals,
            instructionNames: ixNames,
            err: tx.err,
          });
        }
      }
    }
    return { solRows: sol, splRowsFromMain: spl, allMints: mints };
  }, [mainHistory.allTransactions, address]);

  // SPL change rows from ATA history (fallback for non-Helius, or when a specific mint is selected on non-Helius)
  const splRowsFromAta = useMemo(() => {
    if (!selectedAta || !selectedMint) return [];
    const rows: ChangeRow[] = [];
    for (const tx of ataHistory.allTransactions) {
      const ixNames = getInstructionNames(tx);
      for (const c of computeTokenBalanceChanges(tx)) {
        if (c.address === selectedAta && c.mint === selectedMint) {
          rows.push({
            signature: tx.signature,
            blockTime: tx.blockTime,
            type: "spl",
            delta: c.delta,
            postBalance: c.postAmount,
            mint: c.mint,
            decimals: c.decimals,
            instructionNames: ixNames,
            err: tx.err,
          });
        }
      }
    }
    return rows;
  }, [ataHistory.allTransactions, selectedAta, selectedMint]);

  // Fetch asset info for all known mints (from token balances + tx history SPL rows)
  const allKnownMints = useMemo(() => {
    const mints = new Set<string>(allMints);
    for (const t of tokenBalances.tokens) {
      mints.add(t.mint);
    }
    return mints;
  }, [allMints, tokenBalances.tokens]);

  useEffect(() => {
    if (allKnownMints.size === 0) return;
    let cancelled = false;
    for (const mint of allKnownMints) {
      if (!assetInfos.has(mint)) {
        detectAsset(mint, rpcUrl).then((info) => {
          if (cancelled) return;
          setAssetInfos((prev) => {
            const next = new Map(prev);
            next.set(mint, info);
            return next;
          });
        });
      }
    }
    return () => { cancelled = true; };
  }, [allKnownMints, rpcUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const isHelius = mainHistory.isHelius;

  // Display rows based on filter + date range
  const displayRows = useMemo(() => {
    let rows: ChangeRow[];
    if (mintFilter === "sol") {
      rows = solRows;
    } else if (mintFilter === "spl") {
      if (isHelius && selectedMint) {
        // On Helius, filter SPL rows from main history by selected mint
        rows = splRowsFromMain.filter((r) => r.mint === selectedMint);
      } else if (isHelius && !selectedMint) {
        // On Helius with no mint selected, show all SPL rows
        rows = splRowsFromMain;
      } else {
        // Non-Helius: use ATA-fetched rows
        rows = splRowsFromAta;
      }
    } else {
      // "all" — show SOL + SPL rows combined (SPL from main history on Helius)
      rows = [...solRows, ...splRowsFromMain];
      // Sort by blockTime descending (or ascending if that's the sort order)
      rows.sort((a, b) => {
        const ta = a.blockTime ?? 0;
        const tb = b.blockTime ?? 0;
        return tb - ta; // newest first (matching default desc order)
      });
    }

    // Apply date range filter
    if (fromDate || toDate) {
      rows = rows.filter((r) => {
        if (!r.blockTime) return true;
        if (fromDate && r.blockTime < fromDate) return false;
        if (toDate && r.blockTime > toDate) return false;
        return true;
      });
    }

    return rows;
  }, [solRows, splRowsFromMain, splRowsFromAta, mintFilter, selectedMint, isHelius, fromDate, toDate]);

  // Active loading state depends on which source is active
  // On Helius, mainHistory with balanceChanged covers everything
  const useAtaSource = !isHelius && mintFilter === "spl" && selectedMint && selectedAta;
  const activeLoading = useAtaSource ? ataHistory.isLoading : mainHistory.isLoading;
  const activeHasMore = useAtaSource ? ataHistory.hasMore : mainHistory.hasMore;
  const activeLoadMore = useAtaSource ? ataHistory.loadMore : mainHistory.loadMore;
  const activeError = useAtaSource ? ataHistory.error : mainHistory.error;

  // Close mint dropdown on outside click
  useEffect(() => {
    if (!mintDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (mintSearchRef.current && !mintSearchRef.current.contains(e.target as Node)) {
        setMintDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [mintDropdownOpen]);

  function getMintDisplayName(mint: string): string {
    const info = assetInfos.get(mint);
    if (info?.name) return info.name;
    if (info?.symbol) return info.symbol;
    return getLabel(mint) ?? shortenAddress(mint);
  }


  // Filter tokens for the searchable dropdown
  const filteredTokens = useMemo(() => {
    if (!mintSearch.trim()) return tokenBalances.tokens;
    const q = mintSearch.trim().toLowerCase();
    return tokenBalances.tokens.filter((t) => {
      const info = assetInfos.get(t.mint);
      const name = info?.name?.toLowerCase() ?? "";
      const symbol = info?.symbol?.toLowerCase() ?? "";
      const label = getLabel(t.mint)?.toLowerCase() ?? "";
      const addr = t.mint.toLowerCase();
      return name.includes(q) || symbol.includes(q) || label.includes(q) || addr.includes(q);
    });
  }, [tokenBalances.tokens, mintSearch, assetInfos, getLabel]);

  function formatDelta(row: ChangeRow): string {
    if (row.type === "sol") return lamportsToSol(row.delta);
    const d = row.delta as number;
    return d.toFixed(Math.min(row.decimals ?? 6, 6));
  }

  function formatPostBalance(row: ChangeRow): string {
    if (row.type === "sol") return `${lamportsToSol(row.postBalance)} SOL`;
    const p = row.postBalance as number;
    return p.toFixed(Math.min(row.decimals ?? 6, 6));
  }

  function isDeltaPositive(row: ChangeRow): boolean {
    if (typeof row.delta === "bigint") return row.delta > 0n;
    return row.delta > 0;
  }

  return (
    <div className="space-y-2">
      {/* Filter toggles */}
      <div className="flex items-center gap-1.5 px-1 flex-wrap">
        {(["all", "sol", "spl"] as MintFilter[]).map((f) => (
          <Button
            key={f}
            variant={mintFilter === f ? "default" : "outline"}
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => {
              setMintFilter(f);
              if (f !== "spl") setSelectedMint(null);

            }}
          >
            {f === "all" ? "All" : f === "sol" ? "SOL" : "SPL"}
          </Button>
        ))}

        {mintFilter === "spl" && (
          <>
            {tokenBalances.isLoading ? (
              <Loader2 className="size-3 animate-spin text-muted-foreground ml-1" />
            ) : tokenBalances.tokens.length > 0 ? (
              <div className="relative ml-1" ref={mintSearchRef}>
                <input
                  type="text"
                  placeholder={selectedMint ? getMintDisplayName(selectedMint) : "Search token..."}
                  value={mintSearch}
                  onChange={(e) => {
                    setMintSearch(e.target.value);
                    setMintDropdownOpen(true);
                  }}
                  onFocus={() => setMintDropdownOpen(true)}
                  className={cn(
                    "h-6 px-1.5 text-xs rounded border border-border bg-background text-foreground w-[180px]",
                    "placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring",
                    selectedMint && !mintSearch && "placeholder:text-foreground",
                  )}
                />
                {selectedMint && !mintSearch && (
                  <button
                    className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-[10px]"
                    onClick={() => {
                      setSelectedMint(null);
                      setMintSearch("");
                    }}
                    title="Clear selection"
                  >
                    ✕
                  </button>
                )}
                {mintDropdownOpen && (
                  <div className="absolute top-full left-0 mt-0.5 z-50 bg-background border rounded-md shadow-lg w-[260px] max-h-[240px] overflow-y-auto">
                    {filteredTokens.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-muted-foreground">No matching tokens</div>
                    ) : (
                      filteredTokens.map((t) => {
                        const info = assetInfos.get(t.mint);
                        const name = info?.name ?? getLabel(t.mint) ?? shortenAddress(t.mint);
                        const symbol = info?.symbol;
                        return (
                          <button
                            key={t.mint}
                            className={cn(
                              "w-full text-left px-2.5 py-1.5 text-xs hover:bg-muted flex items-center justify-between gap-2 transition-colors",
                              selectedMint === t.mint && "bg-muted",
                            )}
                            onClick={() => {
                              setSelectedMint(t.mint);
                              setMintSearch("");
                              setMintDropdownOpen(false);
                
                            }}
                          >
                            <div className="min-w-0 flex-1">
                              <span className="font-medium truncate block">{name}</span>
                              {symbol && <span className="text-[10px] text-muted-foreground">{symbol}</span>}
                            </div>
                            <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                              {t.uiAmount.toLocaleString(undefined, { maximumFractionDigits: Math.min(t.decimals, 4) })}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            ) : (
              <span className="text-[10px] text-muted-foreground ml-1">No tokens found</span>
            )}
            {selectedMint && ataHistory.isLoading && (
              <Loader2 className="size-3 animate-spin text-muted-foreground" />
            )}
          </>
        )}

      </div>

      {/* Secondary controls row */}
      <HistoryControls
        dateOpen={dateOpen}
        setDateOpen={setDateOpen}
        fromDate={fromDate}
        toDate={toDate}
        onFromDateChange={setFromDate}
        onToDateChange={setToDate}
        pageSize={useAtaSource ? ataHistory.pageSize : mainHistory.pageSize}
        onPageSizeChange={useAtaSource ? ataHistory.setPageSize : mainHistory.setPageSize}
        absoluteTime={absoluteTime}
        onAbsoluteTimeChange={setAbsoluteTime}
        isHelius={isHelius}
        sortOrder={useAtaSource ? ataHistory.sortOrder : mainHistory.sortOrder}
        onSortOrderChange={useAtaSource ? ataHistory.setSortOrder : mainHistory.setSortOrder}
        className="px-1"
      />

      {/* SPL: prompt to select a mint */}
      {mintFilter === "spl" && !selectedMint && !tokenBalances.isLoading && tokenBalances.tokens.length > 0 && (
        <div className="px-2 py-3 text-xs text-muted-foreground text-center">
          Select a token above to filter by a specific token.
        </div>
      )}

      {/* Error */}
      {activeError && (
        <div className="px-2 py-1.5 text-xs text-red-500 bg-red-500/10 rounded">
          {activeError}
        </div>
      )}

      {/* Row count */}
      {displayRows.length > 0 && (
        <div className="text-[10px] text-muted-foreground px-1">
          {displayRows.length} change{displayRows.length !== 1 ? "s" : ""}
        </div>
      )}

      {/* Table */}
      {displayRows.length > 0 ? (
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
                  Change
                </th>
                <th className="text-right px-2 py-1 font-medium text-muted-foreground">
                  Post Balance
                </th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, i) => {
                const positive = isDeltaPositive(row);
                return (
                  <tr key={`${row.signature}-${row.type}-${row.mint ?? "sol"}-${i}`} className="border-t">
                    <td className="px-2 py-1">
                      <div className="flex items-center gap-1">
                        <button
                          className="font-mono text-blue-500 hover:underline cursor-pointer"
                          onClick={() => onTransactionClick(row.signature)}
                        >
                          {shortenAddress(row.signature, 4)}
                        </button>
                        <CopyButton value={row.signature} iconSize="size-2.5" />
                      </div>
                      {row.instructionNames.length > 0 && (
                        <div className="flex flex-wrap gap-0.5 mt-0.5">
                          {row.instructionNames.map((name) => (
                            <Badge key={name} variant="outline" className="text-[8px] px-1 py-0">
                              {name}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1 text-muted-foreground whitespace-nowrap align-top">
                      {row.blockTime ? (absoluteTime ? formatAbsoluteTime(row.blockTime) : formatRelativeTime(row.blockTime)) : "-"}
                    </td>
                    <td className="px-2 py-1 text-right align-top">
                      <span
                        className={cn(
                          "font-mono",
                          positive ? "text-green-500" : "text-red-500",
                        )}
                      >
                        {positive ? "+" : ""}
                        {formatDelta(row)}
                        {row.type === "sol" ? " SOL" : ""}
                      </span>
                      {row.mint && (
                        <div className="text-[10px] text-muted-foreground">
                          {getMintDisplayName(row.mint)}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1 text-right font-mono text-muted-foreground align-top">
                      {formatPostBalance(row)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (mintFilter !== "spl" || selectedMint) && !activeLoading ? (
        <div className="px-2 py-4 text-xs text-muted-foreground text-center">
          No balance changes found.
        </div>
      ) : null}

      {/* Load More */}
      <LoadMoreFooter isLoading={activeLoading} hasMore={activeHasMore} onLoadMore={activeLoadMore} />
    </div>
  );
}
