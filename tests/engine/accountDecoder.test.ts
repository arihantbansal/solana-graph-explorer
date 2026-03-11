import { describe, it, expect } from "vitest";
import {
  BorshReader,
  identifyAccountType,
  decodeAccountData,
  decodeStructData,
} from "@/engine/accountDecoder";
import { tokenIdl } from "../fixtures/tokenIdl";
import {
  tokenAccountData,
  tokenAccountDataNone,
  mintAccountData,
  unknownAccountData,
  nestedStructData,
  testPubkeyBytes,
  testPubkeyBase58,
} from "../fixtures/accountData";

// --- BorshReader primitive tests ---

describe("BorshReader", () => {
  describe("integer types", () => {
    it("reads u8", () => {
      const reader = new BorshReader(new Uint8Array([42]));
      expect(reader.readU8()).toBe(42);
    });

    it("reads u16 little-endian", () => {
      const buf = new Uint8Array(2);
      new DataView(buf.buffer).setUint16(0, 0x1234, true);
      const reader = new BorshReader(buf);
      expect(reader.readU16()).toBe(0x1234);
    });

    it("reads u32 little-endian", () => {
      const buf = new Uint8Array(4);
      new DataView(buf.buffer).setUint32(0, 0x12345678, true);
      const reader = new BorshReader(buf);
      expect(reader.readU32()).toBe(0x12345678);
    });

    it("reads u64 as bigint", () => {
      const buf = new Uint8Array(8);
      new DataView(buf.buffer).setBigUint64(0, 123456789012345n, true);
      const reader = new BorshReader(buf);
      expect(reader.readU64()).toBe(123456789012345n);
    });

    it("reads u128 as bigint", () => {
      const buf = new Uint8Array(16);
      // lo = 1_000_000, hi = 0
      new DataView(buf.buffer).setBigUint64(0, 1_000_000n, true);
      new DataView(buf.buffer).setBigUint64(8, 0n, true);
      const reader = new BorshReader(buf);
      expect(reader.readU128()).toBe(1_000_000n);
    });

    it("reads u128 with high bits", () => {
      const buf = new Uint8Array(16);
      new DataView(buf.buffer).setBigUint64(0, 0n, true);
      new DataView(buf.buffer).setBigUint64(8, 1n, true);
      const reader = new BorshReader(buf);
      expect(reader.readU128()).toBe(1n << 64n);
    });

    it("reads i8", () => {
      const buf = new Uint8Array(1);
      new DataView(buf.buffer).setInt8(0, -42);
      const reader = new BorshReader(buf);
      expect(reader.readI8()).toBe(-42);
    });

    it("reads i16 little-endian", () => {
      const buf = new Uint8Array(2);
      new DataView(buf.buffer).setInt16(0, -1000, true);
      const reader = new BorshReader(buf);
      expect(reader.readI16()).toBe(-1000);
    });

    it("reads i32 little-endian", () => {
      const buf = new Uint8Array(4);
      new DataView(buf.buffer).setInt32(0, -100_000, true);
      const reader = new BorshReader(buf);
      expect(reader.readI32()).toBe(-100_000);
    });

    it("reads i64 as bigint", () => {
      const buf = new Uint8Array(8);
      new DataView(buf.buffer).setBigInt64(0, -9999999999n, true);
      const reader = new BorshReader(buf);
      expect(reader.readI64()).toBe(-9999999999n);
    });
  });

  describe("bool, string, bytes, pubkey", () => {
    it("reads bool true", () => {
      const reader = new BorshReader(new Uint8Array([1]));
      expect(reader.readBool()).toBe(true);
    });

    it("reads bool false", () => {
      const reader = new BorshReader(new Uint8Array([0]));
      expect(reader.readBool()).toBe(false);
    });

    it("reads string", () => {
      const str = "hello";
      const strBytes = new TextEncoder().encode(str);
      const buf = new Uint8Array(4 + strBytes.length);
      new DataView(buf.buffer).setUint32(0, strBytes.length, true);
      buf.set(strBytes, 4);
      const reader = new BorshReader(buf);
      expect(reader.readString()).toBe("hello");
    });

    it("reads bytes", () => {
      const data = new Uint8Array([3, 0, 0, 0, 10, 20, 30]);
      const reader = new BorshReader(data);
      const result = reader.readBytes();
      expect(result).toEqual(new Uint8Array([10, 20, 30]));
    });

    it("reads pubkey as base58 string", () => {
      const reader = new BorshReader(testPubkeyBytes);
      const result = reader.readPubkey();
      expect(result).toBe(testPubkeyBase58);
    });

    it("reads pubkey of all zeros as base58", () => {
      const reader = new BorshReader(new Uint8Array(32));
      const result = reader.readPubkey();
      expect(result).toBe("11111111111111111111111111111111");
    });
  });

  describe("vec, option, array", () => {
    it("reads vec of u8", () => {
      const data = new Uint8Array([3, 0, 0, 0, 10, 20, 30]);
      const reader = new BorshReader(data);
      const result = reader.readVec(() => reader.readU8());
      expect(result).toEqual([10, 20, 30]);
    });

    it("reads empty vec", () => {
      const data = new Uint8Array([0, 0, 0, 0]);
      const reader = new BorshReader(data);
      const result = reader.readVec(() => reader.readU8());
      expect(result).toEqual([]);
    });

    it("reads option Some", () => {
      const data = new Uint8Array([1, 42]);
      const reader = new BorshReader(data);
      const result = reader.readOption(() => reader.readU8());
      expect(result).toBe(42);
    });

    it("reads option None", () => {
      const data = new Uint8Array([0]);
      const reader = new BorshReader(data);
      const result = reader.readOption(() => reader.readU8());
      expect(result).toBeNull();
    });

    it("reads fixed array", () => {
      const buf = new Uint8Array(6);
      new DataView(buf.buffer).setUint16(0, 100, true);
      new DataView(buf.buffer).setUint16(2, 200, true);
      new DataView(buf.buffer).setUint16(4, 300, true);
      const reader = new BorshReader(buf);
      const result = reader.readFixedArray(() => reader.readU16(), 3);
      expect(result).toEqual([100, 200, 300]);
    });
  });

  it("advances offset correctly through multiple reads", () => {
    const buf = new Uint8Array(3);
    buf[0] = 1;
    buf[1] = 2;
    buf[2] = 3;
    const reader = new BorshReader(buf);
    expect(reader.readU8()).toBe(1);
    expect(reader.offset).toBe(1);
    expect(reader.readU8()).toBe(2);
    expect(reader.offset).toBe(2);
    expect(reader.readU8()).toBe(3);
    expect(reader.offset).toBe(3);
  });
});

// --- identifyAccountType ---

describe("identifyAccountType", () => {
  it("matches tokenAccount discriminator", () => {
    const result = identifyAccountType(tokenAccountData, tokenIdl);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("tokenAccount");
  });

  it("matches mintAccount discriminator", () => {
    const result = identifyAccountType(mintAccountData, tokenIdl);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("mintAccount");
  });

  it("returns null for unknown discriminator", () => {
    const result = identifyAccountType(unknownAccountData, tokenIdl);
    expect(result).toBeNull();
  });

  it("returns null for data shorter than 8 bytes", () => {
    const result = identifyAccountType(new Uint8Array([1, 2, 3]), tokenIdl);
    expect(result).toBeNull();
  });

  it("returns null when IDL has no accounts", () => {
    const idlNoAccounts = { ...tokenIdl, accounts: undefined };
    const result = identifyAccountType(tokenAccountData, idlNoAccounts);
    expect(result).toBeNull();
  });
});

// --- decodeAccountData ---

describe("decodeAccountData", () => {
  it("correctly decodes a full tokenAccount struct", () => {
    const typeDef = tokenIdl.types!.find((t) => t.name === "tokenAccount")!;
    const decoded = decodeAccountData(tokenAccountData, typeDef, tokenIdl);

    expect(decoded.authority).toBe(testPubkeyBase58);
    expect(decoded.amount).toBe(1000n);
    expect(decoded.decimals).toBe(9);
    expect(decoded.isInitialized).toBe(true);
    expect(decoded.name).toBe("TestToken");
    expect(decoded.optionalMemo).toBe("hello");
    expect(decoded.tags).toEqual([10, 20, 30]);
  });

  it("handles option fields with None", () => {
    const typeDef = tokenIdl.types!.find((t) => t.name === "tokenAccount")!;
    const decoded = decodeAccountData(tokenAccountDataNone, typeDef, tokenIdl);

    expect(decoded.optionalMemo).toBeNull();
    expect(decoded.tags).toEqual([10, 20, 30]);
  });

  it("decodes mintAccount with u128 and option None", () => {
    const typeDef = tokenIdl.types!.find((t) => t.name === "mintAccount")!;
    const decoded = decodeAccountData(mintAccountData, typeDef, tokenIdl);

    expect(decoded.supply).toBe(1_000_000n);
    expect(decoded.decimals).toBe(6);
    expect(decoded.freezeAuthority).toBeNull();
  });

  it("handles nested defined types", () => {
    const typeDef = tokenIdl.types!.find((t) => t.name === "nestedStruct")!;
    const decoded = decodeStructData(nestedStructData, typeDef, tokenIdl);

    const inner = decoded.inner as Record<string, unknown>;
    expect(inner.x).toBe(-42);
    expect(inner.y).toBe(9999999999n);
    expect(decoded.value).toBe(77);
  });
});
