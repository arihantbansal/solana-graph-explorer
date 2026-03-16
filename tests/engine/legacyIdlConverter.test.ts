import { describe, it, expect } from "vitest";
import { isLegacyFormat, convertLegacyIdl } from "@/engine/legacyIdlConverter";
import { sha256 } from "@noble/hashes/sha2.js";

describe("isLegacyFormat", () => {
  it("detects legacy format (no metadata.spec)", () => {
    const idl = {
      name: "my_program",
      version: "0.1.0",
      instructions: [],
    };
    expect(isLegacyFormat(idl)).toBe(true);
  });

  it("rejects v0.30+ format (has metadata.spec)", () => {
    const idl = {
      metadata: { name: "my_program", version: "0.1.0", spec: "0.1.0" },
      instructions: [],
    };
    expect(isLegacyFormat(idl as Record<string, unknown>)).toBe(false);
  });

  it("rejects objects without name/version", () => {
    expect(isLegacyFormat({ instructions: [] })).toBe(false);
  });
});

describe("convertLegacyIdl", () => {
  const sampleLegacy = {
    name: "myProgram",
    version: "0.1.0",
    instructions: [
      {
        name: "initialize",
        accounts: [
          { name: "myAccount", isMut: true, isSigner: true },
          { name: "systemProgram", isMut: false, isSigner: false },
        ],
        args: [
          { name: "bumpSeed", type: "u8" },
          { name: "dataValue", type: "u64" },
        ],
      },
      {
        name: "transferTokens",
        accounts: [
          { name: "fromAccount", isMut: true, isSigner: false },
          { name: "toAccount", isMut: true, isSigner: false },
          { name: "authority", isMut: false, isSigner: true },
        ],
        args: [
          { name: "amount", type: "u64" },
        ],
      },
    ],
    accounts: [
      {
        name: "MyState",
        type: {
          kind: "struct" as const,
          fields: [
            { name: "owner", type: "publicKey" },
            { name: "value", type: "u64" },
            { name: "isActive", type: "bool" },
          ],
        },
      },
    ],
    types: [
      {
        name: "TransferParams",
        type: {
          kind: "struct" as const,
          fields: [
            { name: "amount", type: "u64" },
            { name: "recipient", type: "publicKey" },
          ],
        },
      },
      {
        name: "Status",
        type: {
          kind: "enum" as const,
          variants: [
            { name: "Active" },
            { name: "Paused" },
            { name: "Closed", fields: [{ name: "reason", type: "string" }] },
          ],
        },
      },
    ],
    events: [
      {
        name: "TransferEvent",
        fields: [
          { name: "from", type: "publicKey" },
          { name: "to", type: "publicKey" },
          { name: "amount", type: "u64" },
        ],
      },
    ],
    errors: [
      { code: 6000, name: "InvalidOwner", msg: "Invalid owner" },
    ],
  };

  it("converts metadata correctly", () => {
    const idl = convertLegacyIdl(sampleLegacy, "Prog111");
    expect(idl.metadata.name).toBe("my_program");
    expect(idl.metadata.version).toBe("0.1.0");
    expect(idl.metadata.spec).toBe("0.1.0");
    expect(idl.address).toBe("Prog111");
  });

  it("generates correct instruction discriminators", () => {
    const idl = convertLegacyIdl(sampleLegacy);
    const initIx = idl.instructions.find((ix) => ix.name === "initialize");
    expect(initIx).toBeDefined();

    // Discriminator should be sha256("global:initialize")[0..8]
    const expected = Array.from(sha256(new TextEncoder().encode("global:initialize")).slice(0, 8));
    expect(initIx!.discriminator).toEqual(expected);
  });

  it("converts camelCase instruction names to snake_case", () => {
    const idl = convertLegacyIdl(sampleLegacy);
    const names = idl.instructions.map((ix) => ix.name);
    expect(names).toContain("initialize");
    expect(names).toContain("transfer_tokens");
  });

  it("converts publicKey type to pubkey", () => {
    const idl = convertLegacyIdl(sampleLegacy);
    const myState = idl.types!.find((t) => t.name === "MyState");
    expect(myState).toBeDefined();
    const ownerField = myState!.type.fields!.find((f) => f.name === "owner");
    expect(ownerField!.type).toBe("pubkey");
  });

  it("converts isMut to writable and isSigner to signer", () => {
    const idl = convertLegacyIdl(sampleLegacy);
    const initIx = idl.instructions.find((ix) => ix.name === "initialize");
    const myAccount = initIx!.accounts.find((a) => a.name === "my_account");
    expect(myAccount!.writable).toBe(true);
    expect(myAccount!.signer).toBe(true);

    const systemProgram = initIx!.accounts.find((a) => a.name === "system_program");
    expect(systemProgram!.writable).toBeUndefined();
    expect(systemProgram!.signer).toBeUndefined();
  });

  it("converts field names to snake_case", () => {
    const idl = convertLegacyIdl(sampleLegacy);
    const initIx = idl.instructions.find((ix) => ix.name === "initialize");
    const argNames = initIx!.args.map((a) => a.name);
    expect(argNames).toContain("bump_seed");
    expect(argNames).toContain("data_value");
  });

  it("generates account discriminators", () => {
    const idl = convertLegacyIdl(sampleLegacy);
    const myStateAccount = idl.accounts!.find((a) => a.name === "MyState");
    expect(myStateAccount).toBeDefined();

    const expected = Array.from(sha256(new TextEncoder().encode("account:MyState")).slice(0, 8));
    expect(myStateAccount!.discriminator).toEqual(expected);
  });

  it("converts type definitions with defined references", () => {
    const idl = convertLegacyIdl(sampleLegacy);
    const transferParams = idl.types!.find((t) => t.name === "TransferParams");
    expect(transferParams).toBeDefined();
    const recipientField = transferParams!.type.fields!.find((f) => f.name === "recipient");
    expect(recipientField!.type).toBe("pubkey");
  });

  it("converts enum variants", () => {
    const idl = convertLegacyIdl(sampleLegacy);
    const status = idl.types!.find((t) => t.name === "Status");
    expect(status).toBeDefined();
    expect(status!.type.kind).toBe("enum");
    expect(status!.type.variants).toHaveLength(3);
    expect(status!.type.variants![0].name).toBe("Active");
    expect(status!.type.variants![2].name).toBe("Closed");
  });

  it("converts events", () => {
    const idl = convertLegacyIdl(sampleLegacy);
    expect(idl.events).toHaveLength(1);
    expect(idl.events![0].name).toBe("TransferEvent");

    const expected = Array.from(sha256(new TextEncoder().encode("event:TransferEvent")).slice(0, 8));
    expect(idl.events![0].discriminator).toEqual(expected);

    // Event type should also be added to types
    const eventType = idl.types!.find((t) => t.name === "TransferEvent");
    expect(eventType).toBeDefined();
    expect(eventType!.type.fields!.find((f) => f.name === "from")!.type).toBe("pubkey");
  });

  it("preserves errors", () => {
    const idl = convertLegacyIdl(sampleLegacy);
    expect(idl.errors).toHaveLength(1);
    expect(idl.errors![0].code).toBe(6000);
    expect(idl.errors![0].name).toBe("InvalidOwner");
  });

  it("handles nested account structs", () => {
    const legacyWithNested = {
      name: "test",
      version: "0.1.0",
      instructions: [
        {
          name: "doThing",
          accounts: [
            { name: "user", isMut: false, isSigner: true },
            {
              name: "tokenAccounts",
              accounts: [
                { name: "source", isMut: true, isSigner: false },
                { name: "destination", isMut: true, isSigner: false },
              ],
            },
          ],
          args: [],
        },
      ],
    };

    const idl = convertLegacyIdl(legacyWithNested);
    const ix = idl.instructions[0];
    expect(ix.accounts).toHaveLength(2);
    expect(ix.accounts[0].name).toBe("user");
    expect(ix.accounts[1].name).toBe("token_accounts");
    expect(ix.accounts[1].accounts).toHaveLength(2);
    expect(ix.accounts[1].accounts![0].name).toBe("source");
    expect(ix.accounts[1].accounts![0].writable).toBe(true);
  });
});
