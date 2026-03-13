import { describe, it, expect } from "vitest";
import {
  extractPdaDefinitions,
  encodeSeedValue,
  seedInputToBytes,
  buildSeedBuffers,
} from "@/engine/pdaDeriver";
import type { Idl } from "@/types/idl";
import type { SeedInputValue } from "@/types/pdaExplorer";

const MOCK_IDL: Idl = {
  address: "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS",
  metadata: { name: "test_program", version: "0.1.0", spec: "0.1.0" },
  instructions: [
    {
      name: "initialize",
      discriminator: [0, 1, 2, 3, 4, 5, 6, 7],
      accounts: [
        {
          name: "user_stats",
          pda: {
            seeds: [
              { kind: "const", value: [117, 115, 101, 114, 95, 115, 116, 97, 116, 115] }, // "user_stats"
              { kind: "account", path: "authority" },
            ],
          },
        },
        {
          name: "authority",
          signer: true,
        },
      ],
      args: [],
    },
    {
      name: "update",
      discriminator: [8, 9, 10, 11, 12, 13, 14, 15],
      accounts: [
        {
          name: "user_stats",
          pda: {
            seeds: [
              { kind: "const", value: [117, 115, 101, 114, 95, 115, 116, 97, 116, 115] },
              { kind: "account", path: "authority" },
            ],
          },
        },
        {
          name: "game_state",
          pda: {
            seeds: [
              { kind: "const", value: "game" },
              { kind: "arg", path: "game_id" },
            ],
          },
        },
        {
          name: "authority",
          signer: true,
        },
      ],
      args: [{ name: "game_id", type: "u64" }],
    },
  ],
  accounts: [],
  types: [],
};

describe("extractPdaDefinitions", () => {
  it("extracts unique PDAs from IDL instructions", () => {
    const pdas = extractPdaDefinitions(
      MOCK_IDL,
      "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS",
    );
    expect(pdas).toHaveLength(2);
  });

  it("deduplicates PDAs with same seed signature across instructions", () => {
    const pdas = extractPdaDefinitions(
      MOCK_IDL,
      "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS",
    );
    const userStats = pdas.find((p) => p.name === "user_stats");
    expect(userStats).toBeDefined();
    expect(userStats!.instructionNames).toEqual(["initialize", "update"]);
  });

  it("preserves distinct PDAs", () => {
    const pdas = extractPdaDefinitions(
      MOCK_IDL,
      "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS",
    );
    const gameState = pdas.find((p) => p.name === "game_state");
    expect(gameState).toBeDefined();
    expect(gameState!.instructionNames).toEqual(["update"]);
    expect(gameState!.seeds).toHaveLength(2);
  });

  it("uses program's address as default programId", () => {
    const pdas = extractPdaDefinitions(
      MOCK_IDL,
      "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS",
    );
    for (const pda of pdas) {
      expect(pda.programId).toBe("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");
    }
  });

  it("returns empty array for IDL with no PDAs", () => {
    const noPdaIdl: Idl = {
      metadata: { name: "simple", version: "0.1.0", spec: "0.1.0" },
      instructions: [
        {
          name: "init",
          discriminator: [0, 0, 0, 0, 0, 0, 0, 0],
          accounts: [{ name: "user", signer: true }],
          args: [],
        },
      ],
    };
    expect(extractPdaDefinitions(noPdaIdl, "abc")).toEqual([]);
  });
});

describe("encodeSeedValue", () => {
  it("encodes utf8 strings", () => {
    const bytes = encodeSeedValue("hello", "utf8");
    expect(bytes).toEqual(new Uint8Array([104, 101, 108, 108, 111]));
  });

  it("encodes hex strings", () => {
    const bytes = encodeSeedValue("deadbeef", "hex");
    expect(bytes).toEqual(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
  });

  it("encodes hex strings with 0x prefix", () => {
    const bytes = encodeSeedValue("0xdeadbeef", "hex");
    expect(bytes).toEqual(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
  });

  it("encodes base64 strings", () => {
    const bytes = encodeSeedValue("aGVsbG8=", "base64");
    expect(bytes).toEqual(new Uint8Array([104, 101, 108, 108, 111]));
  });

  it("encodes base58 strings", () => {
    // "1" in base58 = 0x00
    const bytes = encodeSeedValue("1", "base58");
    expect(bytes).toEqual(new Uint8Array([0]));
  });

  it("throws on odd-length hex", () => {
    expect(() => encodeSeedValue("abc", "hex")).toThrow("even length");
  });
});

describe("seedInputToBytes", () => {
  it("handles const seeds with byte arrays", async () => {
    const input: SeedInputValue = {
      seed: { kind: "const", value: [1, 2, 3] },
      value: "",
    };
    expect(await seedInputToBytes(input)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("handles const seeds with string values", async () => {
    const input: SeedInputValue = {
      seed: { kind: "const", value: "hello" },
      value: "",
    };
    expect(await seedInputToBytes(input)).toEqual(
      new Uint8Array([104, 101, 108, 108, 111]),
    );
  });

  it("handles account seeds as base58 pubkeys", async () => {
    // "11111111111111111111111111111111" is the system program (32 zero bytes)
    const input: SeedInputValue = {
      seed: { kind: "account", path: "authority" },
      value: "11111111111111111111111111111111",
    };
    const bytes = await seedInputToBytes(input);
    expect(bytes).toHaveLength(32);
    // All zeros for the system program address
    expect(bytes.every((b) => b === 0)).toBe(true);
  });

  it("handles arg seeds with utf8 encoding by default", async () => {
    const input: SeedInputValue = {
      seed: { kind: "arg", path: "name" },
      value: "test",
    };
    expect(await seedInputToBytes(input)).toEqual(
      new Uint8Array([116, 101, 115, 116]),
    );
  });

  it("handles arg seeds with hex encoding", async () => {
    const input: SeedInputValue = {
      seed: { kind: "arg", path: "data" },
      value: "ff00",
      bufferEncoding: "hex",
    };
    expect(await seedInputToBytes(input)).toEqual(new Uint8Array([255, 0]));
  });

  it("applies sha256 transform", async () => {
    const input: SeedInputValue = {
      seed: { kind: "arg", path: "name" },
      value: "test",
      transform: "sha256",
    };
    const result = await seedInputToBytes(input);
    // SHA-256 always produces 32 bytes
    expect(result).toHaveLength(32);
    // Should NOT equal the raw utf8 bytes
    expect(result).not.toEqual(new Uint8Array([116, 101, 115, 116]));
  });
});

describe("buildSeedBuffers", () => {
  it("builds array of seed buffers from inputs", async () => {
    const inputs: SeedInputValue[] = [
      { seed: { kind: "const", value: "prefix" }, value: "" },
      {
        seed: { kind: "account", path: "owner" },
        value: "11111111111111111111111111111111",
      },
    ];
    const buffers = await buildSeedBuffers(inputs);
    expect(buffers).toHaveLength(2);
    expect(buffers[0]).toEqual(new TextEncoder().encode("prefix"));
    expect(buffers[1]).toHaveLength(32);
  });
});
