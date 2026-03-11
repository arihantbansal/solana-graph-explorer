import { describe, it, expect } from "vitest";
import { inferTokenRelationships } from "@/engine/tokenAccountInference";

const SOURCE = "SourceAddr1111111111111111111111111111111111";

describe("inferTokenRelationships", () => {
  it('field named "mint" with pubkey value produces token relationship (type: "mint")', () => {
    const decodedData = {
      mint: "MintAddr1111111111111111111111111111111111111",
    };

    const result = inferTokenRelationships(SOURCE, decodedData);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      sourceAddress: SOURCE,
      targetAddress: "MintAddr1111111111111111111111111111111111111",
      type: "token",
      tokenType: "mint",
    });
  });

  it('field named "token_account" produces token relationship (type: "token_account")', () => {
    const decodedData = {
      token_account: "TokenAcct111111111111111111111111111111111111",
    };

    const result = inferTokenRelationships(SOURCE, decodedData);

    expect(result).toHaveLength(1);
    expect(result[0].tokenType).toBe("token_account");
  });

  it('field named "asset" produces token relationship (type: "asset")', () => {
    const decodedData = {
      asset: "AssetAddr111111111111111111111111111111111111",
    };

    const result = inferTokenRelationships(SOURCE, decodedData);

    expect(result).toHaveLength(1);
    expect(result[0].tokenType).toBe("asset");
  });

  it("non-matching fields are ignored", () => {
    const decodedData = {
      counter: "SomeAddr1111111111111111111111111111111111111",
      bump: "AnotherAddr1111111111111111111111111111111111",
      authority: "AuthAddr1111111111111111111111111111111111111",
    };

    const result = inferTokenRelationships(SOURCE, decodedData);

    expect(result).toHaveLength(0);
  });

  it("case insensitive matching", () => {
    const decodedData = {
      Mint: "MintAddr1111111111111111111111111111111111111",
      ASSET: "AssetAddr111111111111111111111111111111111111",
      TokenAccount: "TokenAcct111111111111111111111111111111111111",
    };

    const result = inferTokenRelationships(SOURCE, decodedData);

    expect(result).toHaveLength(3);
    const types = result.map((r) => r.tokenType);
    expect(types).toContain("mint");
    expect(types).toContain("asset");
    expect(types).toContain("token_account");
  });

  it("skips non-string values", () => {
    const decodedData = {
      mint: 12345,
      asset: null,
      token_account: undefined,
    };

    const result = inferTokenRelationships(
      SOURCE,
      decodedData as unknown as Record<string, unknown>
    );

    expect(result).toHaveLength(0);
  });
});
