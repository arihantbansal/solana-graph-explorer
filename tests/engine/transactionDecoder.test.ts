import { describe, it, expect } from "vitest";
import {
  computeBalanceChanges,
  computeTokenBalanceChanges,
} from "@/engine/transactionDecoder";
import type { ParsedTransaction } from "@/types/transaction";

function makeTx(overrides: Partial<ParsedTransaction> = {}): ParsedTransaction {
  return {
    signature: "test-sig",
    slot: 100,
    blockTime: 1700000000,
    err: null,
    fee: 5000,
    accountKeys: ["Alice111", "Bob2222", "Carol33"],
    instructions: [],
    innerInstructions: [],
    logMessages: [],
    preBalances: [1000000000, 2000000000, 500000000],
    postBalances: [900000000, 2100000000, 500000000],
    preTokenBalances: [],
    postTokenBalances: [],
    ...overrides,
  };
}

describe("computeBalanceChanges", () => {
  it("computes SOL balance deltas for accounts that changed", () => {
    const tx = makeTx();
    const changes = computeBalanceChanges(tx);

    expect(changes).toHaveLength(2);
    // Alice lost 100M lamports
    expect(changes[0]).toEqual({
      address: "Alice111",
      preBalance: 1000000000n,
      postBalance: 900000000n,
      delta: -100000000n,
    });
    // Bob gained 100M lamports
    expect(changes[1]).toEqual({
      address: "Bob2222",
      preBalance: 2000000000n,
      postBalance: 2100000000n,
      delta: 100000000n,
    });
  });

  it("returns empty array when no balances changed", () => {
    const tx = makeTx({
      preBalances: [1000, 2000],
      postBalances: [1000, 2000],
    });
    const changes = computeBalanceChanges(tx);
    expect(changes).toHaveLength(0);
  });

  it("handles empty balance arrays", () => {
    const tx = makeTx({
      accountKeys: [],
      preBalances: [],
      postBalances: [],
    });
    const changes = computeBalanceChanges(tx);
    expect(changes).toHaveLength(0);
  });
});

describe("computeTokenBalanceChanges", () => {
  it("computes token balance changes for matching pre/post entries", () => {
    const tx = makeTx({
      preTokenBalances: [
        {
          accountIndex: 0,
          mint: "MintAAA",
          uiTokenAmount: {
            amount: "1000000",
            decimals: 6,
            uiAmount: 1.0,
            uiAmountString: "1.0",
          },
        },
      ],
      postTokenBalances: [
        {
          accountIndex: 0,
          mint: "MintAAA",
          uiTokenAmount: {
            amount: "2000000",
            decimals: 6,
            uiAmount: 2.0,
            uiAmountString: "2.0",
          },
        },
      ],
    });

    const changes = computeTokenBalanceChanges(tx);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toEqual({
      address: "Alice111",
      mint: "MintAAA",
      preAmount: 1.0,
      postAmount: 2.0,
      delta: 1.0,
      decimals: 6,
    });
  });

  it("handles new token accounts (post-only)", () => {
    const tx = makeTx({
      preTokenBalances: [],
      postTokenBalances: [
        {
          accountIndex: 1,
          mint: "MintBBB",
          uiTokenAmount: {
            amount: "5000000",
            decimals: 6,
            uiAmount: 5.0,
            uiAmountString: "5.0",
          },
        },
      ],
    });

    const changes = computeTokenBalanceChanges(tx);
    expect(changes).toHaveLength(1);
    expect(changes[0].delta).toBe(5.0);
    expect(changes[0].preAmount).toBe(0);
  });

  it("skips unchanged token balances", () => {
    const tb = {
      accountIndex: 0,
      mint: "MintAAA",
      uiTokenAmount: {
        amount: "1000000",
        decimals: 6,
        uiAmount: 1.0,
        uiAmountString: "1.0",
      },
    };
    const tx = makeTx({
      preTokenBalances: [tb],
      postTokenBalances: [tb],
    });

    const changes = computeTokenBalanceChanges(tx);
    expect(changes).toHaveLength(0);
  });

  it("handles closed token accounts (pre-only)", () => {
    const tx = makeTx({
      preTokenBalances: [
        {
          accountIndex: 0,
          mint: "MintAAA",
          uiTokenAmount: {
            amount: "1000000",
            decimals: 6,
            uiAmount: 1.0,
            uiAmountString: "1.0",
          },
        },
      ],
      postTokenBalances: [],
    });

    const changes = computeTokenBalanceChanges(tx);
    expect(changes).toHaveLength(1);
    expect(changes[0].delta).toBe(-1.0);
  });
});
