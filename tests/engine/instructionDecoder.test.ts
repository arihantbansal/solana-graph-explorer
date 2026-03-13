import { describe, it, expect } from "vitest";
import { decodeInstruction } from "@/engine/instructionDecoder";
import type { Idl } from "@/types/idl";
import type { ParsedInstruction } from "@/types/transaction";
import { getBase58Decoder } from "@solana/kit";

const base58Decoder = getBase58Decoder();

/** Helper to build instruction data: 8-byte discriminator + borsh-encoded args, returned as base58 string */
function buildInstructionData(discriminator: number[], argBytes: number[] = []): string {
  const bytes = new Uint8Array([...discriminator, ...argBytes]);
  return base58Decoder.decode(bytes);
}

const mockIdl: Idl = {
  metadata: { name: "test_program", version: "0.1.0", spec: "0.1.0" },
  instructions: [
    {
      name: "initialize",
      discriminator: [0, 1, 2, 3, 4, 5, 6, 7],
      accounts: [],
      args: [],
    },
    {
      name: "transfer",
      discriminator: [10, 20, 30, 40, 50, 60, 70, 80],
      accounts: [],
      args: [
        { name: "amount", type: "u64" },
      ],
    },
    {
      name: "set_name",
      discriminator: [100, 101, 102, 103, 104, 105, 106, 107],
      accounts: [],
      args: [
        { name: "name", type: "string" },
        { name: "active", type: "bool" },
      ],
    },
  ],
  accounts: [],
  types: [],
};

describe("decodeInstruction", () => {
  it("matches discriminator and returns instruction name for no-arg instruction", () => {
    const ix: ParsedInstruction = {
      programId: "TestProgram111111111111111111111111",
      accounts: [],
      data: buildInstructionData([0, 1, 2, 3, 4, 5, 6, 7]),
    };

    const result = decodeInstruction(ix, mockIdl);
    expect(result).not.toBeNull();
    expect(result!.instructionName).toBe("initialize");
    expect(result!.args).toEqual({});
    expect(result!.programName).toBe("test_program");
  });

  it("decodes u64 arg correctly", () => {
    // u64 value 1000 in little-endian
    const amountBytes = [0xe8, 0x03, 0, 0, 0, 0, 0, 0]; // 1000 as u64 LE
    const ix: ParsedInstruction = {
      programId: "TestProgram111111111111111111111111",
      accounts: [],
      data: buildInstructionData([10, 20, 30, 40, 50, 60, 70, 80], amountBytes),
    };

    const result = decodeInstruction(ix, mockIdl);
    expect(result).not.toBeNull();
    expect(result!.instructionName).toBe("transfer");
    expect(result!.args.amount).toBe(1000n);
  });

  it("decodes string and bool args", () => {
    // string "hi" = length (4 bytes LE) + utf8 bytes, then bool true = 1
    const strBytes = [2, 0, 0, 0, 0x68, 0x69]; // "hi"
    const boolByte = [1]; // true
    const ix: ParsedInstruction = {
      programId: "TestProgram111111111111111111111111",
      accounts: [],
      data: buildInstructionData(
        [100, 101, 102, 103, 104, 105, 106, 107],
        [...strBytes, ...boolByte],
      ),
    };

    const result = decodeInstruction(ix, mockIdl);
    expect(result).not.toBeNull();
    expect(result!.instructionName).toBe("set_name");
    expect(result!.args.name).toBe("hi");
    expect(result!.args.active).toBe(true);
  });

  it("returns null when discriminator does not match any instruction", () => {
    const ix: ParsedInstruction = {
      programId: "TestProgram111111111111111111111111",
      accounts: [],
      data: buildInstructionData([255, 255, 255, 255, 255, 255, 255, 255]),
    };

    const result = decodeInstruction(ix, mockIdl);
    expect(result).toBeNull();
  });

  it("returns null when data is too short", () => {
    const ix: ParsedInstruction = {
      programId: "TestProgram111111111111111111111111",
      accounts: [],
      data: base58Decoder.decode(new Uint8Array([1, 2, 3])),
    };

    const result = decodeInstruction(ix, mockIdl);
    expect(result).toBeNull();
  });

  it("returns null when data is empty", () => {
    const ix: ParsedInstruction = {
      programId: "TestProgram111111111111111111111111",
      accounts: [],
      data: "",
    };

    const result = decodeInstruction(ix, mockIdl);
    expect(result).toBeNull();
  });

  it("returns instruction name even if arg decoding fails", () => {
    // Provide matching discriminator but truncated arg data
    const ix: ParsedInstruction = {
      programId: "TestProgram111111111111111111111111",
      accounts: [],
      data: buildInstructionData([10, 20, 30, 40, 50, 60, 70, 80], [1, 2]), // too short for u64
    };

    const result = decodeInstruction(ix, mockIdl);
    expect(result).not.toBeNull();
    expect(result!.instructionName).toBe("transfer");
    expect(result!.args).toEqual({});
  });
});
