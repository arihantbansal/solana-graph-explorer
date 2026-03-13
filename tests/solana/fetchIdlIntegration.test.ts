import { describe, it, expect } from "vitest";
import { deriveIdlAddress, deriveMetadataIdlAddress, fetchIdl } from "@/solana/fetchIdl";

const RPC_URL = "https://solana-rpc.web.helium.io";

/**
 * Integration tests that hit a real RPC endpoint.
 * These verify that IDL derivation, fetching, and parsing work end-to-end.
 */

describe("IDL address derivation (integration)", () => {
  it("derives legacy Anchor IDL address using createWithSeed", async () => {
    // Helium Lazy Distributor — known to have an on-chain IDL
    const addr = await deriveIdlAddress(
      "1azyuavdMyvsivtNxPoz6SucD18eDHeXzFCUPq5XU7w",
    );
    expect(addr).toBe("Gr1hWcFqmCRpF2xnUJ1XunLaLFAWxK27P3VMvJgSPACW");
  });

  it("derives Program Metadata IDL address", async () => {
    const addr = await deriveMetadataIdlAddress(
      "1azyuavdMyvsivtNxPoz6SucD18eDHeXzFCUPq5XU7w",
    );
    // Should be a valid base58 address
    expect(addr.length).toBeGreaterThan(30);
    expect(addr.length).toBeLessThanOrEqual(44);
  });
});

describe("fetchIdl (integration)", () => {
  it("fetches and parses IDL for Helium Lazy Distributor", async () => {
    const idl = await fetchIdl(
      "1azyuavdMyvsivtNxPoz6SucD18eDHeXzFCUPq5XU7w",
      RPC_URL,
    );

    expect(idl).not.toBeNull();
    expect(idl!.metadata?.name).toBe("lazy_distributor");
    expect(idl!.instructions.length).toBeGreaterThan(0);
    expect(idl!.accounts!.length).toBeGreaterThan(0);
    expect(idl!.types!.length).toBeGreaterThan(0);
  }, 30000);

  it("returns null for a program with no IDL", async () => {
    // System Program — no IDL
    const idl = await fetchIdl(
      "11111111111111111111111111111111",
      RPC_URL,
    );
    expect(idl).toBeNull();
  }, 15000);

  it("IDL has discriminators on accounts", async () => {
    const idl = await fetchIdl(
      "1azyuavdMyvsivtNxPoz6SucD18eDHeXzFCUPq5XU7w",
      RPC_URL,
    );

    expect(idl).not.toBeNull();
    for (const account of idl!.accounts!) {
      expect(account.discriminator).toBeDefined();
      expect(account.discriminator.length).toBe(8);
    }
  }, 30000);
});
