import { describe, it, expect } from "vitest";
import { decodeInstruction } from "@/engine/instructionDecoder";
import {
  systemProgramIdl,
  splTokenIdl,
  ataIdl,
  memoV2Idl,
  computeBudgetIdl,
} from "@/solana/builtinIdls";
import type { ParsedInstruction } from "@/types/transaction";
import { getBase58Decoder } from "@solana/kit";

const base58Decoder = getBase58Decoder();

function toBase58(bytes: number[]): string {
  return base58Decoder.decode(new Uint8Array(bytes));
}

/** Write a u32 LE into bytes */
function u32LE(n: number): number[] {
  return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff];
}

/** Write a u64 LE into bytes */
function u64LE(n: number): number[] {
  const lo = n & 0xffffffff;
  const hi = Math.floor(n / 0x100000000) & 0xffffffff;
  return [...u32LE(lo), ...u32LE(hi)];
}

describe("System Program instruction decoding", () => {
  it("decodes Transfer instruction (tag=2)", () => {
    const lamports = 1_000_000_000; // 1 SOL
    const data = [...u32LE(2), ...u64LE(lamports)];
    const ix: ParsedInstruction = {
      programId: "11111111111111111111111111111111",
      accounts: ["sender111", "receiver111"],
      data: toBase58(data),
    };

    const result = decodeInstruction(ix, systemProgramIdl);
    expect(result).not.toBeNull();
    expect(result!.instructionName).toBe("transfer");
    expect(result!.args.lamports).toBe(BigInt(lamports));
    expect(result!.programName).toBe("system_program");
  });

  it("decodes CreateAccount instruction (tag=0)", () => {
    const lamports = 2_000_000;
    const space = 165;
    // CreateAccount: lamports(u64) + space(u64) + owner(pubkey, 32 bytes)
    const ownerBytes = new Array(32).fill(1); // dummy pubkey
    const data = [...u32LE(0), ...u64LE(lamports), ...u64LE(space), ...ownerBytes];
    const ix: ParsedInstruction = {
      programId: "11111111111111111111111111111111",
      accounts: ["from111", "to111"],
      data: toBase58(data),
    };

    const result = decodeInstruction(ix, systemProgramIdl);
    expect(result).not.toBeNull();
    expect(result!.instructionName).toBe("createAccount");
    expect(result!.args.lamports).toBe(BigInt(lamports));
    expect(result!.args.space).toBe(BigInt(space));
  });

  it("decodes Assign instruction (tag=1)", () => {
    const ownerBytes = new Array(32).fill(7);
    const data = [...u32LE(1), ...ownerBytes];
    const ix: ParsedInstruction = {
      programId: "11111111111111111111111111111111",
      accounts: ["account111"],
      data: toBase58(data),
    };

    const result = decodeInstruction(ix, systemProgramIdl);
    expect(result).not.toBeNull();
    expect(result!.instructionName).toBe("assign");
  });
});

describe("SPL Token instruction decoding", () => {
  it("decodes Transfer instruction (tag=3)", () => {
    const amount = 500_000;
    const data = [3, ...u64LE(amount)];
    const ix: ParsedInstruction = {
      programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      accounts: ["source111", "dest111", "authority111"],
      data: toBase58(data),
    };

    const result = decodeInstruction(ix, splTokenIdl);
    expect(result).not.toBeNull();
    expect(result!.instructionName).toBe("transfer");
    expect(result!.args.amount).toBe(BigInt(amount));
    expect(result!.programName).toBe("spl_token");
  });

  it("decodes TransferChecked instruction (tag=12)", () => {
    const amount = 1_000_000;
    const decimals = 6;
    const data = [12, ...u64LE(amount), decimals];
    const ix: ParsedInstruction = {
      programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      accounts: ["source111", "mint111", "dest111", "authority111"],
      data: toBase58(data),
    };

    const result = decodeInstruction(ix, splTokenIdl);
    expect(result).not.toBeNull();
    expect(result!.instructionName).toBe("transferChecked");
    expect(result!.args.amount).toBe(BigInt(amount));
    expect(result!.args.decimals).toBe(decimals);
  });

  it("decodes CloseAccount instruction (tag=9, no args)", () => {
    const data = [9];
    const ix: ParsedInstruction = {
      programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      accounts: ["account111", "dest111", "authority111"],
      data: toBase58(data),
    };

    const result = decodeInstruction(ix, splTokenIdl);
    expect(result).not.toBeNull();
    expect(result!.instructionName).toBe("closeAccount");
    expect(result!.args).toEqual({});
  });

  it("decodes MintTo instruction (tag=7)", () => {
    const amount = 100;
    const data = [7, ...u64LE(amount)];
    const ix: ParsedInstruction = {
      programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      accounts: ["mint111", "account111", "authority111"],
      data: toBase58(data),
    };

    const result = decodeInstruction(ix, splTokenIdl);
    expect(result).not.toBeNull();
    expect(result!.instructionName).toBe("mintTo");
    expect(result!.args.amount).toBe(BigInt(amount));
  });
});

describe("Associated Token Account instruction decoding", () => {
  it("decodes Create instruction (tag=0, no args)", () => {
    const data = [0];
    const ix: ParsedInstruction = {
      programId: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
      accounts: ["funder111", "ata111", "wallet111", "mint111", "sys111", "token111"],
      data: toBase58(data),
    };

    const result = decodeInstruction(ix, ataIdl);
    expect(result).not.toBeNull();
    expect(result!.instructionName).toBe("create");
    expect(result!.programName).toBe("associated_token_account");
  });

  it("decodes CreateIdempotent instruction (tag=1)", () => {
    const data = [1];
    const ix: ParsedInstruction = {
      programId: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
      accounts: ["funder111", "ata111", "wallet111", "mint111", "sys111", "token111"],
      data: toBase58(data),
    };

    const result = decodeInstruction(ix, ataIdl);
    expect(result).not.toBeNull();
    expect(result!.instructionName).toBe("createIdempotent");
  });
});

describe("Memo instruction decoding", () => {
  it("decodes UTF-8 memo text with empty discriminator", () => {
    const text = "Hello, Solana!";
    const textBytes = Array.from(new TextEncoder().encode(text));
    const ix: ParsedInstruction = {
      programId: "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
      accounts: [],
      data: toBase58(textBytes),
    };

    const result = decodeInstruction(ix, memoV2Idl);
    expect(result).not.toBeNull();
    expect(result!.instructionName).toBe("memo");
    expect(result!.args.memo).toBe("Hello, Solana!");
    expect(result!.programName).toBe("spl_memo");
  });
});

describe("Compute Budget instruction decoding", () => {
  it("decodes SetComputeUnitLimit (tag=2)", () => {
    const units = 400_000;
    const data = [2, ...u32LE(units)];
    const ix: ParsedInstruction = {
      programId: "ComputeBudget111111111111111111111111111111",
      accounts: [],
      data: toBase58(data),
    };

    const result = decodeInstruction(ix, computeBudgetIdl);
    expect(result).not.toBeNull();
    expect(result!.instructionName).toBe("setComputeUnitLimit");
    expect(result!.args.units).toBe(units);
  });

  it("decodes SetComputeUnitPrice (tag=3)", () => {
    const microLamports = 50_000;
    const data = [3, ...u64LE(microLamports)];
    const ix: ParsedInstruction = {
      programId: "ComputeBudget111111111111111111111111111111",
      accounts: [],
      data: toBase58(data),
    };

    const result = decodeInstruction(ix, computeBudgetIdl);
    expect(result).not.toBeNull();
    expect(result!.instructionName).toBe("setComputeUnitPrice");
    expect(result!.args.microLamports).toBe(BigInt(microLamports));
  });
});

describe("No discriminator collisions within IDLs", () => {
  const idls = [
    { name: "System Program", idl: systemProgramIdl },
    { name: "SPL Token", idl: splTokenIdl },
    { name: "ATA", idl: ataIdl },
    { name: "Compute Budget", idl: computeBudgetIdl },
  ];

  for (const { name, idl } of idls) {
    it(`${name} has no discriminator collisions`, () => {
      const seen = new Map<string, string>();
      for (const ix of idl.instructions) {
        const key = JSON.stringify(ix.discriminator);
        expect(seen.has(key), `Collision: ${ix.name} vs ${seen.get(key)} on discriminator ${key}`).toBe(false);
        seen.set(key, ix.name);
      }
    });
  }
});
