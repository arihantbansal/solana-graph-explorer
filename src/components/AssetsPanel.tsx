import { useState, useMemo, useEffect, useRef } from "react";
import { useAssets } from "@/hooks/useAssets";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/CopyButton";
import { shortenAddress } from "@/utils/format";
import { Loader2, Image } from "lucide-react";

interface AssetsPanelProps {
  address: string;
  rpcUrl: string;
  onAssetClick: (assetAddress: string) => void;
}

type FilterMode = "all" | "nfts" | "cnfts";

export function AssetsPanel({ address, rpcUrl, onAssetClick }: AssetsPanelProps) {
  const { assets, total, isLoading, error, hasMore, load, loadMore } =
    useAssets(address, rpcUrl);

  const [filter, setFilter] = useState<FilterMode>("all");
  const [search, setSearch] = useState("");

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

  const filtered = useMemo(() => {
    let items = assets;

    if (filter === "nfts") {
      items = items.filter((a) => a.isNft && !a.isCompressed);
    } else if (filter === "cnfts") {
      items = items.filter((a) => a.isNft && a.isCompressed);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.id.toLowerCase().includes(q),
      );
    }

    return items;
  }, [assets, filter, search]);

  const nftCount = useMemo(
    () => assets.filter((a) => a.isNft && !a.isCompressed).length,
    [assets],
  );
  const cnftCount = useMemo(
    () => assets.filter((a) => a.isNft && a.isCompressed).length,
    [assets],
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Image className="size-3.5" />
          Assets
        </h4>
      </div>

      <div className="space-y-2">
          {/* Filter toggle buttons */}
          <div className="flex gap-1">
            <button
              onClick={() => setFilter("all")}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                filter === "all"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              All ({assets.length})
            </button>
            <button
              onClick={() => setFilter("nfts")}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                filter === "nfts"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              NFTs ({nftCount})
            </button>
            <button
              onClick={() => setFilter("cnfts")}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                filter === "cnfts"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              cNFTs ({cnftCount})
            </button>
          </div>

          {/* Search input */}
          <input
            type="text"
            placeholder="Search by name or address..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-2 py-1 text-xs rounded border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />

          {/* Total count */}
          <div className="text-[10px] text-muted-foreground">
            Total {total} NFT{total !== 1 ? "s" : ""}
            {filtered.length !== assets.length && (
              <span> ({filtered.length} shown)</span>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
              {error}
            </div>
          )}

          {/* Asset grid */}
          {filtered.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {filtered.map((asset) => (
                <button
                  key={asset.id}
                  onClick={() => onAssetClick(asset.id)}
                  className="flex flex-col items-center p-2 rounded border border-border bg-muted/30 hover:bg-muted/60 transition-colors text-left cursor-pointer"
                  title={`${asset.name}\n${asset.id}`}
                >
                  {/* Thumbnail */}
                  <div className="w-full aspect-square rounded overflow-hidden bg-muted flex items-center justify-center mb-1.5">
                    {asset.image ? (
                      <img
                        src={asset.image}
                        alt={asset.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                          (
                            e.target as HTMLImageElement
                          ).parentElement!.classList.add("image-fallback");
                        }}
                      />
                    ) : (
                      <Image className="size-6 text-muted-foreground" />
                    )}
                  </div>

                  {/* Name */}
                  <div className="w-full text-xs truncate text-center">
                    {asset.name || "Unnamed"}
                  </div>

                  {/* Address + copy */}
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-[10px] text-muted-foreground">
                      {shortenAddress(asset.id)}
                    </span>
                    <CopyButton value={asset.id} iconSize="size-2.5" />
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Loading indicator */}
          {isLoading && (
            <div className="flex items-center justify-center py-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 mr-1 animate-spin" />
              Loading assets...
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
          {!isLoading && filtered.length === 0 && !error && (
            <div className="text-xs text-muted-foreground text-center py-2">
              No assets found
            </div>
          )}
        </div>
    </div>
  );
}
