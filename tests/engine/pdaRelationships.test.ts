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
  it("extracts PDA seed relationships when account type matches PDA name", () => {
    const idl = makeIdl([
      {
        name: "initialize",
        discriminator: [0],
        accounts: [
          {
            name: "my_pda",
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

    const result = inferPdaRelationships(SOURCE, decodedData, idl, "MyPda");

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

  it("skips PDA accounts that don't match the source account type", () => {
    const idl = makeIdl([
      {
        name: "approve_program_v0",
        discriminator: [0],
        accounts: [
          {
            name: "some_other_account",
            pda: {
              seeds: [{ kind: "account", path: "dao" }],
            },
          },
        ],
        args: [],
      },
    ]);

    const decodedData = {
      dao: "DaoAddr1111111111111111111111111111111111111",
    };

    // KeyToAssetV0 doesn't match "some_other_account"
    const result = inferPdaRelationships(SOURCE, decodedData, idl, "KeyToAssetV0");

    expect(result).toHaveLength(0);
  });

  it("matches account type with version suffix stripped", () => {
    const idl = makeIdl([
      {
        name: "update",
        discriminator: [1],
        accounts: [
          {
            name: "config",
            pda: {
              seeds: [{ kind: "account", path: "owner" }],
            },
          },
        ],
        args: [],
      },
    ]);

    const decodedData = {
      owner: "OwnerAddr11111111111111111111111111111111111",
    };

    // "ConfigV0" → "config_v0", stripped → "config" matches "config"
    const result = inferPdaRelationships(SOURCE, decodedData, idl, "ConfigV0");

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

    const result = inferPdaRelationships(SOURCE, {}, idl, "Vault");

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

    const result = inferPdaRelationships(SOURCE, decodedData, idl, "Item");

    expect(result).toHaveLength(1);
    expect(result[0].isPartial).toBe(true);
  });

  it("works with multiple instructions matching the same type", () => {
    const idl = makeIdl([
      {
        name: "instrA",
        discriminator: [10],
        accounts: [
          {
            name: "my_account",
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
            name: "my_account",
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

    const result = inferPdaRelationships(SOURCE, decodedData, idl, "MyAccount");

    expect(result).toHaveLength(2);
    expect(result[0].instructionName).toBe("instrA");
    expect(result[1].instructionName).toBe("instrB");
  });

  it("deduplicates relationships", () => {
    const idl = makeIdl([
      {
        name: "instrA",
        discriminator: [10],
        accounts: [
          {
            name: "pda_a",
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
            name: "pda_a",
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

    const result = inferPdaRelationships(SOURCE, decodedData, idl, "PdaA");

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

    const result = inferPdaRelationships(SOURCE, {}, idl, "Signer");

    expect(result).toHaveLength(0);
  });

  it("falls back to matching all PDAs when no accountType provided", () => {
    const idl = makeIdl([
      {
        name: "initialize",
        discriminator: [0],
        accounts: [
          {
            name: "any_pda",
            pda: {
              seeds: [{ kind: "account", path: "authority" }],
            },
          },
        ],
        args: [],
      },
    ]);

    const decodedData = {
      authority: "AuthAddr1111111111111111111111111111111111111",
    };

    // No accountType — should still find relationships (backward compat)
    const result = inferPdaRelationships(SOURCE, decodedData, idl);

    expect(result).toHaveLength(1);
  });
});
