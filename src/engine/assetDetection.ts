export interface DasAssetInfo {
  name: string;
  image: string | null;
  isNft: boolean;
  owner: string | null;
}

export interface DasGetAssetResponse {
  id: string;
  content?: {
    metadata?: {
      name?: string;
      symbol?: string;
    };
    links?: {
      image?: string;
    };
    json_uri?: string;
  };
  interface?: string;
  compression?: {
    compressed: boolean;
  };
  ownership?: {
    owner?: string;
  };
}

// Cache: address → DasAssetInfo | null (null = confirmed no asset)
const assetCache = new Map<string, DasAssetInfo | null>();
// Track in-flight requests to deduplicate concurrent calls for the same address
const inflightRequests = new Map<string, Promise<DasAssetInfo | null>>();

export function clearAssetCache(): void {
  assetCache.clear();
  inflightRequests.clear();
}

export async function detectAsset(
  mintAddress: string,
  rpcEndpoint: string
): Promise<DasAssetInfo | null> {
  // Return cached result
  if (assetCache.has(mintAddress)) {
    return assetCache.get(mintAddress) ?? null;
  }

  // Deduplicate concurrent requests for the same address
  const inflight = inflightRequests.get(mintAddress);
  if (inflight) return inflight;

  const promise = _fetchAsset(mintAddress, rpcEndpoint);
  inflightRequests.set(mintAddress, promise);

  try {
    const result = await promise;
    assetCache.set(mintAddress, result);
    return result;
  } finally {
    inflightRequests.delete(mintAddress);
  }
}

async function _fetchAsset(
  mintAddress: string,
  rpcEndpoint: string,
): Promise<DasAssetInfo | null> {
  try {
    const response = await fetch(rpcEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getAsset",
        params: { id: mintAddress },
      }),
    });

    if (!response.ok) {
      return null;
    }

    const json = await response.json();

    if (json.error || !json.result) {
      return null;
    }

    return parseAssetResponse(json.result);
  } catch {
    // DAS API unavailable — graceful fallback
    return null;
  }
}

export function parseAssetResponse(
  result: DasGetAssetResponse
): DasAssetInfo {
  const name =
    result.content?.metadata?.name ?? result.id ?? "Unknown";
  const image = result.content?.links?.image ?? null;

  const nftInterfaces = [
    "V1_NFT",
    "V2_NFT",
    "ProgrammableNFT",
    "V1_PRINT",
    "LEGACY_NFT",
  ];
  const isNft = nftInterfaces.includes(result.interface ?? "");

  const owner = result.ownership?.owner ?? null;

  return { name, image, isNft, owner };
}
