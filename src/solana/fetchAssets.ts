import { nftInterfaces, type DasGetAssetResponse } from "@/engine/assetDetection";

export interface AssetItem {
  id: string; // asset address
  name: string;
  image: string | null;
  isNft: boolean;
  isCompressed: boolean;
  symbol?: string;
}

export interface AssetPage {
  items: AssetItem[];
  total: number;
  hasMore: boolean;
  page: number;
  error?: string;
}

function parseAssetItem(result: DasGetAssetResponse): AssetItem {
  const name =
    result.content?.metadata?.name ?? result.id ?? "Unknown";
  const image = result.content?.links?.image ?? null;

  const isNft = nftInterfaces.includes(result.interface ?? "");
  const isCompressed = result.compression?.compressed ?? false;
  const symbol = result.content?.metadata?.symbol ?? undefined;

  return { id: result.id, name, image, isNft, isCompressed, symbol };
}

export async function fetchAssets(
  ownerAddress: string,
  rpcEndpoint: string,
  page: number = 1,
): Promise<AssetPage> {
  try {
    const response = await fetch(rpcEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getAssetsByOwner",
        params: { ownerAddress, page, limit: 50 },
      }),
    });

    if (!response.ok) {
      return {
        items: [],
        total: 0,
        hasMore: false,
        page: 1,
        error: "DAS API not available on this RPC",
      };
    }

    const json = await response.json();

    if (json.error || !json.result) {
      return {
        items: [],
        total: 0,
        hasMore: false,
        page: 1,
        error: "DAS API not available on this RPC",
      };
    }

    const result = json.result;
    const items: AssetItem[] = (result.items ?? []).map(
      (item: DasGetAssetResponse) => parseAssetItem(item),
    );
    const total: number = result.total ?? items.length;
    const currentPage: number = result.page ?? page;
    const limit = 50;
    const hasMore = currentPage * limit < total;

    return { items, total, hasMore, page: currentPage };
  } catch {
    // DAS API unavailable — graceful fallback
    return {
      items: [],
      total: 0,
      hasMore: false,
      page: 1,
      error: "DAS API not available on this RPC",
    };
  }
}
