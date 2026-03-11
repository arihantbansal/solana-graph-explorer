import { describe, it, expect, vi } from "vitest";
import { inflateSync } from "fflate";
import { isLegacyIdl } from "@/types/idl";
import {
  sampleIdl,
  legacyIdl,
  compressedSampleIdl,
  buildIdlAccountData,
  legacyIdlAccountData,
} from "../fixtures/compressedIdl";

/**
 * Test IDL decompression and parsing logic without making real RPC calls.
 * We test the core logic that fetchIdl relies on.
 */

describe("IDL PDA address derivation", () => {
  it("derives a deterministic IDL address for a given program ID", async () => {
    // We import lazily to avoid issues with ESM resolution in tests
    const { deriveIdlAddress } = await import("@/solana/fetchIdl");

    const programId = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
    const address1 = await deriveIdlAddress(programId);
    const address2 = await deriveIdlAddress(programId);

    // Should be deterministic
    expect(address1).toBe(address2);
    // Should be a base58 string of reasonable length
    expect(address1.length).toBeGreaterThan(30);
    expect(address1.length).toBeLessThanOrEqual(44);
  });

  it("derives different addresses for different programs", async () => {
    const { deriveIdlAddress } = await import("@/solana/fetchIdl");

    const addr1 = await deriveIdlAddress(
      "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    );
    const addr2 = await deriveIdlAddress(
      "11111111111111111111111111111111",
    );

    expect(addr1).not.toBe(addr2);
  });
});

describe("IDL decompression", () => {
  it("decompresses zlib-compressed IDL data correctly", () => {
    const decompressed = inflateSync(compressedSampleIdl);
    const jsonStr = new TextDecoder().decode(decompressed);
    const parsed = JSON.parse(jsonStr);

    expect(parsed.metadata.name).toBe("sample_program");
    expect(parsed.metadata.version).toBe("0.1.0");
    expect(parsed.instructions).toHaveLength(1);
    expect(parsed.accounts).toHaveLength(1);
  });

  it("correctly extracts compressed data from full account buffer", () => {
    const accountData = buildIdlAccountData(sampleIdl);

    // Read data_len from offset 40
    const dataLen = new DataView(
      accountData.buffer,
      accountData.byteOffset + 40,
      4,
    ).getUint32(0, true);

    // Extract and decompress
    const compressed = accountData.slice(44, 44 + dataLen);
    const decompressed = inflateSync(compressed);
    const parsed = JSON.parse(new TextDecoder().decode(decompressed));

    expect(parsed.metadata.name).toBe("sample_program");
    expect(parsed.metadata.spec).toBe("0.1.0");
  });
});

describe("IDL format detection", () => {
  it("detects v0.30+ IDL format (has metadata.spec)", () => {
    expect(isLegacyIdl(sampleIdl)).toBe(false);
  });

  it("detects legacy IDL format (no metadata.spec)", () => {
    expect(isLegacyIdl(legacyIdl)).toBe(true);
  });

  it("parses legacy IDL from compressed data", () => {
    const dataLen = new DataView(
      legacyIdlAccountData.buffer,
      legacyIdlAccountData.byteOffset + 40,
      4,
    ).getUint32(0, true);

    const compressed = legacyIdlAccountData.slice(44, 44 + dataLen);
    const decompressed = inflateSync(compressed);
    const parsed = JSON.parse(new TextDecoder().decode(decompressed));

    expect(parsed.name).toBe("legacy_program");
    expect(parsed.metadata.spec).toBeUndefined();
    expect(isLegacyIdl(parsed)).toBe(true);
  });
});
