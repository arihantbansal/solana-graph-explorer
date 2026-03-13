import { describe, it, expect } from "vitest";
import { decodeStructData } from "@/engine/accountDecoder";
import {
  splTokenIdl,
  identifyBuiltinAccount,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from "@/solana/builtinIdls";

// --- Helpers ---

function concat(...parts: (Uint8Array | number[])[]): Uint8Array {
  const arrays = parts.map((p) =>
    p instanceof Uint8Array ? p : new Uint8Array(p),
  );
  const totalLen = arrays.reduce((acc, a) => acc + a.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}

function u64LE(n: bigint): Uint8Array {
  const buf = new Uint8Array(8);
  new DataView(buf.buffer).setBigUint64(0, n, true);
  return buf;
}

function u32LE(n: number): Uint8Array {
  const buf = new Uint8Array(4);
  new DataView(buf.buffer).setUint32(0, n, true);
  return buf;
}

/** 32 bytes of 0x01 */
const testPubkey = new Uint8Array(32).fill(1);
const testPubkeyBase58 = "4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi";

/** COption<Pubkey> Some */
function coptionSomePubkey(pubkey: Uint8Array): Uint8Array {
  return concat(u32LE(1), pubkey);
}

/** COption<Pubkey> None */
function coptionNonePubkey(): Uint8Array {
  return concat(u32LE(0), new Uint8Array(32)); // 4-byte tag + 32-byte empty
}

/** COption<u64> None */
function coptionNoneU64(): Uint8Array {
  return concat(u32LE(0), new Uint8Array(8)); // 4-byte tag + 8-byte empty
}

/** COption<u64> Some */
function coptionSomeU64(n: bigint): Uint8Array {
  return concat(u32LE(1), u64LE(n));
}

// --- Real SPL Token Mint (82 bytes) ---
//   COption<Pubkey> mintAuthority  (36 bytes)
//   u64 supply                     (8 bytes)
//   u8 decimals                    (1 byte)
//   bool isInitialized             (1 byte)
//   COption<Pubkey> freezeAuthority(36 bytes)

function buildRealMintData(opts: {
  mintAuthority: Uint8Array | null;
  supply: bigint;
  decimals: number;
  isInitialized: boolean;
  freezeAuthority: Uint8Array | null;
}): Uint8Array {
  return concat(
    opts.mintAuthority
      ? coptionSomePubkey(opts.mintAuthority)
      : coptionNonePubkey(),
    u64LE(opts.supply),
    [opts.decimals],
    [opts.isInitialized ? 1 : 0],
    opts.freezeAuthority
      ? coptionSomePubkey(opts.freezeAuthority)
      : coptionNonePubkey(),
  );
}

// --- Real SPL Token Account (165 bytes) ---
//   Pubkey mint                    (32 bytes)
//   Pubkey owner                   (32 bytes)
//   u64 amount                     (8 bytes)
//   COption<Pubkey> delegate       (36 bytes)
//   u8 state                       (1 byte)
//   COption<u64> isNative          (12 bytes)
//   u64 delegatedAmount            (8 bytes)
//   COption<Pubkey> closeAuthority (36 bytes)

function buildRealTokenAccountData(opts: {
  mint: Uint8Array;
  owner: Uint8Array;
  amount: bigint;
  delegate: Uint8Array | null;
  state: number;
  isNative: bigint | null;
  delegatedAmount: bigint;
  closeAuthority: Uint8Array | null;
}): Uint8Array {
  return concat(
    opts.mint,
    opts.owner,
    u64LE(opts.amount),
    opts.delegate ? coptionSomePubkey(opts.delegate) : coptionNonePubkey(),
    [opts.state],
    opts.isNative !== null ? coptionSomeU64(opts.isNative) : coptionNoneU64(),
    u64LE(opts.delegatedAmount),
    opts.closeAuthority
      ? coptionSomePubkey(opts.closeAuthority)
      : coptionNonePubkey(),
  );
}

// --- Tests ---

describe("identifyBuiltinAccount", () => {
  it("identifies SPL Token mint by size (82 bytes)", () => {
    const result = identifyBuiltinAccount(82, TOKEN_PROGRAM_ID);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("mint");
  });

  it("identifies SPL Token account by size (165 bytes)", () => {
    const result = identifyBuiltinAccount(165, TOKEN_PROGRAM_ID);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("tokenAccount");
  });

  it("identifies Token-2022 mint", () => {
    const result = identifyBuiltinAccount(82, TOKEN_2022_PROGRAM_ID);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("mint");
  });

  it("identifies Token-2022 account (>= 165 bytes for extensions)", () => {
    const result = identifyBuiltinAccount(200, TOKEN_2022_PROGRAM_ID);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("tokenAccount");
  });

  it("returns null for unknown program", () => {
    const result = identifyBuiltinAccount(82, "SomeOtherProgram111111111111111111111111111");
    expect(result).toBeNull();
  });

  it("returns null for unrecognized size", () => {
    const result = identifyBuiltinAccount(50, TOKEN_PROGRAM_ID);
    expect(result).toBeNull();
  });
});

describe("SPL Token Mint decoding", () => {
  const mintTypeDef = splTokenIdl.types!.find((t) => t.name === "mint")!;

  it("decodes mint with authority and no freeze authority", () => {
    const data = buildRealMintData({
      mintAuthority: testPubkey,
      supply: 1_000_000_000n,
      decimals: 9,
      isInitialized: true,
      freezeAuthority: null,
    });

    expect(data.length).toBe(82);

    const decoded = decodeStructData(data, mintTypeDef, splTokenIdl);
    expect(decoded.mintAuthority).toBe(testPubkeyBase58);
    expect(decoded.supply).toBe(1_000_000_000n);
    expect(decoded.decimals).toBe(9);
    expect(decoded.isInitialized).toBe(true);
    expect(decoded.freezeAuthority).toBeNull();
  });

  it("decodes mint with both authorities", () => {
    const data = buildRealMintData({
      mintAuthority: testPubkey,
      supply: 500n,
      decimals: 6,
      isInitialized: true,
      freezeAuthority: testPubkey,
    });

    const decoded = decodeStructData(data, mintTypeDef, splTokenIdl);
    expect(decoded.mintAuthority).toBe(testPubkeyBase58);
    expect(decoded.supply).toBe(500n);
    expect(decoded.decimals).toBe(6);
    expect(decoded.freezeAuthority).toBe(testPubkeyBase58);
  });

  it("decodes mint with no mint authority", () => {
    const data = buildRealMintData({
      mintAuthority: null,
      supply: 21_000_000n,
      decimals: 8,
      isInitialized: true,
      freezeAuthority: null,
    });

    const decoded = decodeStructData(data, mintTypeDef, splTokenIdl);
    expect(decoded.mintAuthority).toBeNull();
    expect(decoded.supply).toBe(21_000_000n);
  });
});

describe("SPL Token Account decoding", () => {
  const tokenTypeDef = splTokenIdl.types!.find(
    (t) => t.name === "tokenAccount",
  )!;

  const mintPubkey = new Uint8Array(32).fill(2);
  const ownerPubkey = new Uint8Array(32).fill(3);

  it("decodes basic token account with no delegate or close authority", () => {
    const data = buildRealTokenAccountData({
      mint: mintPubkey,
      owner: ownerPubkey,
      amount: 1_000_000n,
      delegate: null,
      state: 1, // Initialized
      isNative: null,
      delegatedAmount: 0n,
      closeAuthority: null,
    });

    expect(data.length).toBe(165);

    const decoded = decodeStructData(data, tokenTypeDef, splTokenIdl);
    expect(decoded.amount).toBe(1_000_000n);
    expect(decoded.delegate).toBeNull();
    expect(decoded.state).toBe(1);
    expect(decoded.isNative).toBeNull();
    expect(decoded.delegatedAmount).toBe(0n);
    expect(decoded.closeAuthority).toBeNull();
    // Verify mint and owner are pubkey strings
    expect(typeof decoded.mint).toBe("string");
    expect(typeof decoded.owner).toBe("string");
  });

  it("decodes token account with delegate and close authority", () => {
    const delegatePubkey = new Uint8Array(32).fill(4);
    const closePubkey = new Uint8Array(32).fill(5);

    const data = buildRealTokenAccountData({
      mint: mintPubkey,
      owner: ownerPubkey,
      amount: 500n,
      delegate: delegatePubkey,
      state: 1,
      isNative: null,
      delegatedAmount: 200n,
      closeAuthority: closePubkey,
    });

    const decoded = decodeStructData(data, tokenTypeDef, splTokenIdl);
    expect(decoded.amount).toBe(500n);
    expect(decoded.delegate).not.toBeNull();
    expect(decoded.delegatedAmount).toBe(200n);
    expect(decoded.closeAuthority).not.toBeNull();
  });

  it("decodes native SOL token account (wrapped SOL)", () => {
    const data = buildRealTokenAccountData({
      mint: mintPubkey,
      owner: ownerPubkey,
      amount: 1_000_000_000n,
      delegate: null,
      state: 1,
      isNative: 890880n, // rent-exempt minimum
      delegatedAmount: 0n,
      closeAuthority: null,
    });

    const decoded = decodeStructData(data, tokenTypeDef, splTokenIdl);
    expect(decoded.isNative).toBe(890880n);
    expect(decoded.amount).toBe(1_000_000_000n);
  });

  it("decodes frozen token account", () => {
    const data = buildRealTokenAccountData({
      mint: mintPubkey,
      owner: ownerPubkey,
      amount: 100n,
      delegate: null,
      state: 2, // Frozen
      isNative: null,
      delegatedAmount: 0n,
      closeAuthority: null,
    });

    const decoded = decodeStructData(data, tokenTypeDef, splTokenIdl);
    expect(decoded.state).toBe(2);
  });
});
