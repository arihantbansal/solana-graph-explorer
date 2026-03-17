import { useTokenBalances } from "@/hooks/useTokenBalances";
import { shortenAddress } from "@/utils/format";
import { detectAsset, type DasAssetInfo } from "@/engine/assetDetection";
import { Loader2, Coins } from "lucide-react";
import { useState, useEffect, useRef } from "react";

interface TokenBalancesProps {
  address: string;
  rpcUrl: string;
  onTokenClick: (tokenAccountAddress: string) => void;
}

export function TokenBalances({
  address,
  rpcUrl,
  onTokenClick,
}: TokenBalancesProps) {
  const { tokens, isLoading, error, load } = useTokenBalances(
    address,
    rpcUrl,
  );

  const [assetInfo, setAssetInfo] = useState<Map<string, DasAssetInfo>>(
    new Map(),
  );

  const loadedRef = useRef(false);

  // Auto-fetch on mount (tab selected)
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    load();
  }, [load]);

  // Reset loadedRef when address changes
  useEffect(() => {
    loadedRef.current = false;
  }, [address]);

  // Progressively load asset info (name/image) for each mint after tokens load
  useEffect(() => {
    if (tokens.length === 0) return;

    let cancelled = false;

    const loadAssets = async () => {
      await Promise.all(
        tokens.map(async (token) => {
          const info = await detectAsset(token.mint, rpcUrl);
          if (info && !cancelled) {
            setAssetInfo((prev) => {
              const next = new Map(prev);
              next.set(token.mint, info);
              return next;
            });
          }
        }),
      );
    };

    loadAssets();
    return () => {
      cancelled = true;
    };
  }, [tokens, rpcUrl]);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Coins className="size-3.5" />
          Token Balances
        </h4>
      </div>

      <div className="space-y-2">
          {/* Count */}
          {tokens.length > 0 && (
            <div className="text-[10px] text-muted-foreground">
              {tokens.length} token{tokens.length !== 1 ? "s" : ""}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
              {error}
            </div>
          )}

          {/* Loading indicator */}
          {isLoading && (
            <div className="flex items-center justify-center py-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 mr-1 animate-spin" />
              Loading token balances...
            </div>
          )}

          {/* Token list */}
          <div className="space-y-1">
            {tokens.map((token) => {
              const asset = assetInfo.get(token.mint);
              const displayName = asset?.name ?? shortenAddress(token.mint);

              return (
                <button
                  key={token.mint}
                  onClick={() => onTokenClick(token.address)}
                  className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/50 transition-colors group w-full text-left cursor-pointer"
                  title={`Explore token account ${token.address}`}
                >
                  {/* Token image */}
                  <div className="size-7 shrink-0 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                    {asset?.image ? (
                      <img
                        src={asset.image}
                        alt={displayName}
                        className="size-7 rounded-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <Coins className="size-3.5 text-muted-foreground" />
                    )}
                  </div>

                  {/* Name + mint */}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">
                      {displayName}
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono truncate">
                      {shortenAddress(token.mint)}
                    </div>
                  </div>

                  {/* Balance */}
                  <div className="shrink-0 text-right">
                    <div className="text-xs font-medium font-mono">
                      {token.uiAmount.toLocaleString(undefined, { maximumFractionDigits: Math.min(token.decimals, 4) })}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Empty state */}
          {!isLoading && tokens.length === 0 && !error && (
            <div className="text-xs text-muted-foreground text-center py-2">
              No tokens found
            </div>
          )}
        </div>
    </div>
  );
}
