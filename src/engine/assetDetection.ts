export interface DasAssetInfo {
  name: string;
  image: string | null;
  isNft: boolean;
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
}

export async function detectAsset(
  mintAddress: string,
  rpcEndpoint: string
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

  return { name, image, isNft };
}
