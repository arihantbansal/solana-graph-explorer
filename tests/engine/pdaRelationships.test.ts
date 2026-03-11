import { describe, it, expect } from "vitest";
import { inferPdaRelationships } from "@/engine/pdaRelationships";
import type { Idl, IdlInstruction } from "@/types/idl";

const SOURCE = "SourceAddr1111111111111111111111111111111111";

function makeIdl(instructions: IdlInstruction[]): Idl {
  return {
    metadata: { name: "test", version: "0.1.0", spec: "0.1.0" },
    instructions,
  };
}

describe("inferPdaRelationships", () => {
  it("extracts PDA seed relationships from IDL instruction accounts", () => {
    const idl = makeIdl([
      {
        name: "initialize",
        discriminator: [0],
        accounts: [
          {
            name: "myPda",
            pda: {
              seeds: [
                { kind: "const", value: [109, 121] }, // "my"
                { kind: "account", path: "authority" },
              ],
            },
          },
        ],
        args: [],
      },
    ]);

    const decodedData = {
      authority: "AuthAddr1111111111111111111111111111111111111",
    };

    const result = inferPdaRelationships(SOURCE, decodedData, idl);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      sourceAddress: SOURCE,
      targetAddress: "AuthAddr1111111111111111111111111111111111111",
      type: "pda_seed",
      seedIndex: 1,
      instructionName: "initialize",
      isPartial: false,
    });
  });

  it("handles seeds with kind 'account' — creates edge", () => {
    const idl = makeIdl([
      {
        name: "update",
        discriminator: [1],
        accounts: [
          {
            name: "config",
            pda: {
              seeds: [
                { kind: "account", path: "owner" },
              ],
            },
          },
        ],
        args: [],
      },
    ]);

    const decodedData = {
      owner: "OwnerAddr11111111111111111111111111111111111",
    };

    const result = inferPdaRelationships(SOURCE, decodedData, idl);

    expect(result).toHaveLength(1);
    expect(result[0].targetAddress).toBe(
      "OwnerAddr11111111111111111111111111111111111"
    );
  });

  it("handles seeds with kind 'const' — no edge", () => {
    const idl = makeIdl([
      {
        name: "create",
        discriminator: [2],
        accounts: [
          {
            name: "vault",
            pda: {
              seeds: [
                { kind: "const", value: [118, 97, 117, 108, 116] }, // "vault"
              ],
            },
          },
        ],
        args: [],
      },
    ]);

    const result = inferPdaRelationships(SOURCE, {}, idl);

    expect(result).toHaveLength(0);
  });

  it("handles seeds with kind 'arg' — marks as partial", () => {
    const idl = makeIdl([
      {
        name: "createWithArg",
        discriminator: [3],
        accounts: [
          {
            name: "item",
            pda: {
              seeds: [
                { kind: "account", path: "owner" },
                { kind: "arg", path: "itemId" },
              ],
            },
          },
        ],
        args: [{ name: "itemId", type: "u64" }],
      },
    ]);

    const decodedData = {
      owner: "OwnerAddr11111111111111111111111111111111111",
    };

    const result = inferPdaRelationships(SOURCE, decodedData, idl);

    expect(result).toHaveLength(1);
    expect(result[0].isPartial).toBe(true);
  });

  it("works with multiple instructions", () => {
    const idl = makeIdl([
      {
        name: "instrA",
        discriminator: [10],
        accounts: [
          {
            name: "pdaA",
            pda: {
              seeds: [{ kind: "account", path: "mint" }],
            },
          },
        ],
        args: [],
      },
      {
        name: "instrB",
        discriminator: [11],
        accounts: [
          {
            name: "pdaB",
            pda: {
              seeds: [{ kind: "account", path: "authority" }],
            },
          },
        ],
        args: [],
      },
    ]);

    const decodedData = {
      mint: "MintAddr1111111111111111111111111111111111111",
      authority: "AuthAddr1111111111111111111111111111111111111",
    };

    const result = inferPdaRelationships(SOURCE, decodedData, idl);

    expect(result).toHaveLength(2);
    expect(result[0].instructionName).toBe("instrA");
    expect(result[1].instructionName).toBe("instrB");
  });

  it("deduplicates relationships", () => {
    // Two instructions with the same PDA seed referencing the same field
    const idl = makeIdl([
      {
        name: "instrA",
        discriminator: [10],
        accounts: [
          {
            name: "pdaA",
            pda: {
              seeds: [{ kind: "account", path: "mint" }],
            },
          },
        ],
        args: [],
      },
      {
        name: "instrA",
        discriminator: [10],
        accounts: [
          {
            name: "pdaA",
            pda: {
              seeds: [{ kind: "account", path: "mint" }],
            },
          },
        ],
        args: [],
      },
    ]);

    const decodedData = {
      mint: "MintAddr1111111111111111111111111111111111111",
    };

    const result = inferPdaRelationships(SOURCE, decodedData, idl);

    expect(result).toHaveLength(1);
  });

  it("skips accounts without pda field", () => {
    const idl = makeIdl([
      {
        name: "simple",
        discriminator: [20],
        accounts: [
          { name: "signer", signer: true },
          { name: "system", address: "11111111111111111111111111111111" },
        ],
        args: [],
      },
    ]);

    const result = inferPdaRelationships(SOURCE, {}, idl);

    expect(result).toHaveLength(0);
  });
});
