import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  parseAssetResponse,
  detectAsset,
  clearAssetCache,
  type DasGetAssetResponse,
} from "@/engine/assetDetection";

describe("parseAssetResponse", () => {
  it("parses DAS getAsset response correctly", () => {
    const response: DasGetAssetResponse = {
      id: "MintAddr1111111111111111111111111111111111111",
      content: {
        metadata: {
          name: "Cool NFT #42",
          symbol: "COOL",
        },
        links: {
          image: "https://arweave.net/abc123",
        },
      },
      interface: "V1_NFT",
    };

    const result = parseAssetResponse(response);

    expect(result).toEqual({
      name: "Cool NFT #42",
      symbol: "COOL",
      image: "https://arweave.net/abc123",
      isNft: true,
      owner: null,
    });
  });

  it("extracts name, image, isNft fields", () => {
    const response: DasGetAssetResponse = {
      id: "FungibleMint1111111111111111111111111111111111",
      content: {
        metadata: {
          name: "My Token",
        },
        links: {
          image: "https://example.com/token.png",
        },
      },
      interface: "FungibleToken",
    };

    const result = parseAssetResponse(response);

    expect(result.name).toBe("My Token");
    expect(result.image).toBe("https://example.com/token.png");
    expect(result.isNft).toBe(false);
  });

  it("handles missing content fields gracefully", () => {
    const response: DasGetAssetResponse = {
      id: "Bare1111111111111111111111111111111111111111",
    };

    const result = parseAssetResponse(response);

    expect(result.name).toBe("Bare1111111111111111111111111111111111111111");
    expect(result.image).toBeNull();
    expect(result.isNft).toBe(false);
  });

  it("recognizes ProgrammableNFT interface as NFT", () => {
    const response: DasGetAssetResponse = {
      id: "pNFT1111111111111111111111111111111111111111",
      content: {
        metadata: { name: "pNFT" },
      },
      interface: "ProgrammableNFT",
    };

    const result = parseAssetResponse(response);

    expect(result.isNft).toBe(true);
  });
});

describe("detectAsset", () => {
  beforeEach(() => {
    clearAssetCache();
  });

  it("returns null when DAS is unavailable (network error)", async () => {
    // Mock fetch to simulate network error
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    try {
      const result = await detectAsset(
        "MintAddr1111111111111111111111111111111111111",
        "https://api.mainnet-beta.solana.com"
      );
      expect(result).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns null when RPC returns an error response", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32601, message: "Method not found" },
      }),
    });

    try {
      const result = await detectAsset(
        "MintAddr1111111111111111111111111111111111111",
        "https://api.mainnet-beta.solana.com"
      );
      expect(result).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns parsed asset info on success", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jsonrpc: "2.0",
        id: 1,
        result: {
          id: "MintAddr1111111111111111111111111111111111111",
          content: {
            metadata: { name: "Test NFT" },
            links: { image: "https://example.com/img.png" },
          },
          interface: "V1_NFT",
        },
      }),
    });

    try {
      const result = await detectAsset(
        "MintAddr1111111111111111111111111111111111111",
        "https://api.mainnet-beta.solana.com"
      );
      expect(result).toEqual({
        name: "Test NFT",
        symbol: undefined,
        image: "https://example.com/img.png",
        isNft: true,
        owner: null,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns null on non-ok HTTP response", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    try {
      const result = await detectAsset(
        "MintAddr1111111111111111111111111111111111111",
        "https://api.mainnet-beta.solana.com"
      );
      expect(result).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
