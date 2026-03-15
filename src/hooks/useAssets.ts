import { useState, useCallback, useRef } from "react";
import { fetchAssets, type AssetItem } from "@/solana/fetchAssets";

interface AssetsCacheEntry {
  items: AssetItem[];
  total: number;
  lastAccessed: number;
}

const assetsCache = new Map<string, AssetsCacheEntry>();
const MAX_CACHE = 20;
const CACHE_TTL = 120_000; // 2 minutes

function evictCache() {
  // Remove expired entries first
  const now = Date.now();
  for (const [key, entry] of assetsCache) {
    if (now - entry.lastAccessed > CACHE_TTL) {
      assetsCache.delete(key);
    }
  }

  // If still over limit, evict oldest
  if (assetsCache.size <= MAX_CACHE) return;
  let oldest: string | null = null;
  let oldestTime = Infinity;
  for (const [key, entry] of assetsCache) {
    if (entry.lastAccessed < oldestTime) {
      oldestTime = entry.lastAccessed;
      oldest = key;
    }
  }
  if (oldest) assetsCache.delete(oldest);
}

function getCached(address: string | undefined): AssetsCacheEntry | undefined {
  if (!address) return undefined;
  const entry = assetsCache.get(address);
  if (!entry) return undefined;
  if (Date.now() - entry.lastAccessed > CACHE_TTL) {
    assetsCache.delete(address);
    return undefined;
  }
  return entry;
}

export function useAssets(address: string | undefined, rpcUrl: string) {
  const prevAddressRef = useRef(address);
  const pageRef = useRef(1);

  const [assets, setAssets] = useState<AssetItem[]>(
    getCached(address)?.items ?? [],
  );
  const [total, setTotal] = useState(getCached(address)?.total ?? 0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // Synchronous reset when address changes
  if (address !== prevAddressRef.current) {
    prevAddressRef.current = address;
    const entry = getCached(address);
    if (entry) {
      setAssets(entry.items);
      setTotal(entry.total);
      setHasMore(entry.items.length < entry.total);
      entry.lastAccessed = Date.now();
      pageRef.current = Math.ceil(entry.items.length / 50);
    } else {
      setAssets([]);
      setTotal(0);
      setError(null);
      setHasMore(false);
      pageRef.current = 1;
    }
  }

  const load = useCallback(async () => {
    if (!address) return;

    setIsLoading(true);
    setError(null);
    pageRef.current = 1;

    try {
      const page = await fetchAssets(address, rpcUrl, 1);

      if (page.error) {
        setError(page.error);
        setAssets([]);
        setTotal(0);
        setHasMore(false);
        return;
      }

      setAssets(page.items);
      setTotal(page.total);
      setHasMore(page.hasMore);

      if (page.items.length > 0) {
        assetsCache.set(address, {
          items: page.items,
          total: page.total,
          lastAccessed: Date.now(),
        });
        evictCache();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch assets");
    } finally {
      setIsLoading(false);
    }
  }, [address, rpcUrl]);

  const loadMore = useCallback(async () => {
    if (!address || !hasMore) return;

    setIsLoading(true);
    setError(null);
    const nextPage = pageRef.current + 1;

    try {
      const page = await fetchAssets(address, rpcUrl, nextPage);

      if (page.error) {
        setError(page.error);
        return;
      }

      pageRef.current = nextPage;

      setAssets((prev) => {
        const existingIds = new Set(prev.map((a) => a.id));
        const newItems = page.items.filter((a) => !existingIds.has(a.id));
        const next = [...prev, ...newItems];

        // Sync to cache
        assetsCache.set(address, {
          items: next,
          total: page.total,
          lastAccessed: Date.now(),
        });
        evictCache();

        return next;
      });

      setTotal(page.total);
      setHasMore(page.hasMore);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch assets");
    } finally {
      setIsLoading(false);
    }
  }, [address, rpcUrl, hasMore]);

  return { assets, total, isLoading, error, hasMore, load, loadMore };
}
