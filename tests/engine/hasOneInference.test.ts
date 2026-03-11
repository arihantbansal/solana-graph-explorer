import { describe, it, expect } from "vitest";
import {
  inferHasOneRelationships,
  WELL_KNOWN_PROGRAM_IDS,
  ZERO_ADDRESS,
} from "@/engine/hasOneInference";
import type { IdlTypeDef, Idl } from "@/types/idl";

const SOURCE = "SourceAddr1111111111111111111111111111111111";

function makeTypeDef(fields: IdlTypeDef["type"]["fields"]): IdlTypeDef {
  return {
    name: "TestAccount",
    type: { kind: "struct", fields: fields ?? [] },
  };
}

const stubIdl: Idl = {
  metadata: { name: "test", version: "0.1.0", spec: "0.1.0" },
  instructions: [],
};

describe("inferHasOneRelationships", () => {
  it("extracts pubkey fields from decoded account data as has_one relationships", () => {
    const typeDef = makeTypeDef([
      { name: "authority", type: "pubkey" },
      { name: "vault", type: "pubkey" },
    ]);
    const decodedData = {
      authority: "AuthAddr1111111111111111111111111111111111111",
      vault: "VaultAddr111111111111111111111111111111111111",
    };

    const result = inferHasOneRelationships(
      SOURCE,
      decodedData,
      typeDef,
      stubIdl
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      sourceAddress: SOURCE,
      targetAddress: "AuthAddr1111111111111111111111111111111111111",
      type: "has_one",
      fieldName: "authority",
      label: "authority",
    });
    expect(result[1]).toMatchObject({
      targetAddress: "VaultAddr111111111111111111111111111111111111",
      fieldName: "vault",
    });
  });

  it("filters out zero address (11111111111111111111111111111111)", () => {
    const typeDef = makeTypeDef([{ name: "owner", type: "pubkey" }]);
    const decodedData = { owner: ZERO_ADDRESS };

    const result = inferHasOneRelationships(
      SOURCE,
      decodedData,
      typeDef,
      stubIdl
    );

    expect(result).toHaveLength(0);
  });

  it("filters out well-known program IDs", () => {
    const wellKnown = Array.from(WELL_KNOWN_PROGRAM_IDS);
    const fields = wellKnown.map((_, i) => ({
      name: `field${i}`,
      type: "pubkey" as const,
    }));
    const decodedData: Record<string, string> = {};
    wellKnown.forEach((addr, i) => {
      decodedData[`field${i}`] = addr;
    });

    const typeDef = makeTypeDef(fields);
    const result = inferHasOneRelationships(
      SOURCE,
      decodedData,
      typeDef,
      stubIdl
    );

    expect(result).toHaveLength(0);
  });

  it("handles accounts with no pubkey fields", () => {
    const typeDef = makeTypeDef([
      { name: "count", type: "u64" },
      { name: "name", type: "string" },
      { name: "active", type: "bool" },
    ]);
    const decodedData = { count: 42, name: "hello", active: true };

    const result = inferHasOneRelationships(
      SOURCE,
      decodedData,
      typeDef,
      stubIdl
    );

    expect(result).toHaveLength(0);
  });

  it("uses field name as relationship label", () => {
    const typeDef = makeTypeDef([
      { name: "delegateAuthority", type: "pubkey" },
    ]);
    const decodedData = {
      delegateAuthority: "DelegAddr111111111111111111111111111111111111",
    };

    const result = inferHasOneRelationships(
      SOURCE,
      decodedData,
      typeDef,
      stubIdl
    );

    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("delegateAuthority");
    expect(result[0].fieldName).toBe("delegateAuthority");
  });

  it("handles nested/non-pubkey fields gracefully", () => {
    const typeDef = makeTypeDef([
      { name: "data", type: { vec: "u8" } },
      { name: "optionalKey", type: { option: "pubkey" } },
      { name: "numbers", type: { array: ["u32", 5] } },
    ]);
    const decodedData = {
      data: [1, 2, 3],
      optionalKey: "SomeAddr1111111111111111111111111111111111111",
      numbers: [1, 2, 3, 4, 5],
    };

    // option<pubkey> is not a direct pubkey type, so it's not extracted
    const result = inferHasOneRelationships(
      SOURCE,
      decodedData,
      typeDef,
      stubIdl
    );

    expect(result).toHaveLength(0);
  });

  it("handles legacy publicKey type", () => {
    const typeDef = makeTypeDef([
      { name: "owner", type: "publicKey" },
    ]);
    const decodedData = {
      owner: "OwnerAddr11111111111111111111111111111111111",
    };

    const result = inferHasOneRelationships(
      SOURCE,
      decodedData,
      typeDef,
      stubIdl
    );

    expect(result).toHaveLength(1);
    expect(result[0].targetAddress).toBe(
      "OwnerAddr11111111111111111111111111111111111"
    );
  });

  it("skips fields where decoded value is not a string", () => {
    const typeDef = makeTypeDef([{ name: "owner", type: "pubkey" }]);
    const decodedData = { owner: 12345 };

    const result = inferHasOneRelationships(
      SOURCE,
      decodedData,
      typeDef,
      stubIdl
    );

    expect(result).toHaveLength(0);
  });

  it("returns empty array for enum typeDef", () => {
    const typeDef: IdlTypeDef = {
      name: "MyEnum",
      type: {
        kind: "enum",
        variants: [{ name: "Active" }, { name: "Inactive" }],
      },
    };
    const decodedData = { variant: "Active" };

    const result = inferHasOneRelationships(
      SOURCE,
      decodedData,
      typeDef,
      stubIdl
    );

    expect(result).toHaveLength(0);
  });
});
