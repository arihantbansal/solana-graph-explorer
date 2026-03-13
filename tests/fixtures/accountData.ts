/**
 * Binary account data buffers matching the tokenIdl fixture.
 * All multi-byte integers are little-endian (Borsh encoding).
 */

/**
 * Helper to build a Uint8Array from parts.
 */
function concat(...parts: (Uint8Array | number[])[]): Uint8Array {
  const arrays = parts.map((p) => (p instanceof Uint8Array ? p : new Uint8Array(p)));
  const totalLen = arrays.reduce((acc, a) => acc + a.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}

/** A known 32-byte pubkey (all 1s) */
export const testPubkeyBytes = new Uint8Array(32).fill(1);

/** The base58 encoding of 32 bytes of 0x01 */
export const testPubkeyBase58 = "4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi";

/** Discriminator for tokenAccount */
const tokenDiscriminator = [0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0];

/**
 * tokenAccount data:
 * - 8 bytes discriminator
 * - 32 bytes authority (pubkey, all 1s)
 * - 8 bytes amount (u64 = 1000 = 0xe8, 0x03, 0x00, ...)
 * - 1 byte decimals (u8 = 9)
 * - 1 byte isInitialized (bool = true = 1)
 * - 4 bytes string length + string bytes for name = "TestToken"
 * - 1 byte option tag (1 = Some) + 4 bytes string length + "hello"
 * - 4 bytes vec length (3) + 3 bytes [10, 20, 30]
 */
function buildTokenAccountData(): Uint8Array {
  const nameBytes = new TextEncoder().encode("TestToken");
  const memoBytes = new TextEncoder().encode("hello");

  // u64 = 1000 LE
  const amountLE = new Uint8Array(8);
  new DataView(amountLE.buffer).setBigUint64(0, 1000n, true);

  // string length LE (u32)
  const nameLenLE = new Uint8Array(4);
  new DataView(nameLenLE.buffer).setUint32(0, nameBytes.length, true);

  const memoLenLE = new Uint8Array(4);
  new DataView(memoLenLE.buffer).setUint32(0, memoBytes.length, true);

  // vec length LE (u32)
  const vecLenLE = new Uint8Array(4);
  new DataView(vecLenLE.buffer).setUint32(0, 3, true);

  return concat(
    tokenDiscriminator,    // 8 bytes discriminator
    testPubkeyBytes,       // 32 bytes pubkey
    amountLE,              // 8 bytes u64
    [9],                   // 1 byte u8 decimals
    [1],                   // 1 byte bool
    nameLenLE, nameBytes,  // string "TestToken"
    [1], memoLenLE, memoBytes, // option Some("hello")
    vecLenLE, [10, 20, 30],   // vec [10, 20, 30]
  );
}

export const tokenAccountData = buildTokenAccountData();

/**
 * tokenAccount data with optionalMemo = None
 */
function buildTokenAccountDataNone(): Uint8Array {
  const nameBytes = new TextEncoder().encode("TestToken");
  const amountLE = new Uint8Array(8);
  new DataView(amountLE.buffer).setBigUint64(0, 1000n, true);
  const nameLenLE = new Uint8Array(4);
  new DataView(nameLenLE.buffer).setUint32(0, nameBytes.length, true);
  const vecLenLE = new Uint8Array(4);
  new DataView(vecLenLE.buffer).setUint32(0, 3, true);

  return concat(
    tokenDiscriminator,
    testPubkeyBytes,
    amountLE,
    [9],
    [1],
    nameLenLE, nameBytes,
    [0],                       // option None
    vecLenLE, [10, 20, 30],
  );
}

export const tokenAccountDataNone = buildTokenAccountDataNone();

/** Discriminator for mintAccount */
const mintDiscriminator = [0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff, 0x00, 0x11];

/**
 * mintAccount data:
 * - 8 bytes discriminator
 * - 16 bytes supply (u128 = 1_000_000)
 * - 1 byte decimals (u8 = 6)
 * - 1 byte option tag (0 = None) for freezeAuthority
 */
function buildMintAccountData(): Uint8Array {
  const supplyLE = new Uint8Array(16);
  new DataView(supplyLE.buffer).setBigUint64(0, 1_000_000n, true);
  // upper 8 bytes remain 0

  return concat(
    mintDiscriminator,
    supplyLE,
    [6],
    [0], // None
  );
}

export const mintAccountData = buildMintAccountData();

/** Unknown discriminator data (no matching account type) */
export const unknownAccountData = new Uint8Array([
  0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
  0x01, 0x02, 0x03, 0x04,
]);

/**
 * Data for testing nested defined types.
 * nestedStruct: { inner: innerData { x: i32, y: i64 }, value: u32 }
 * No discriminator prefix for direct decoding tests.
 */
function buildNestedStructData(): Uint8Array {
  // i32 x = -42 LE
  const xLE = new Uint8Array(4);
  new DataView(xLE.buffer).setInt32(0, -42, true);

  // i64 y = 9999999999 LE
  const yLE = new Uint8Array(8);
  new DataView(yLE.buffer).setBigInt64(0, 9999999999n, true);

  // u32 value = 77
  const valLE = new Uint8Array(4);
  new DataView(valLE.buffer).setUint32(0, 77, true);

  return concat(xLE, yLE, valLE);
}

export const nestedStructData = buildNestedStructData();

/**
 * Data for struct containing a simple enum field.
 * structWithEnum: { status: SimpleEnum, value: u32 }
 * SimpleEnum variant index 1 = "Inactive"
 */
function buildStructWithEnumData(): Uint8Array {
  const valLE = new Uint8Array(4);
  new DataView(valLE.buffer).setUint32(0, 42, true);
  return concat([1], valLE); // enum variant 1 + u32
}

export const structWithEnumData = buildStructWithEnumData();

/**
 * Data for enum with named fields.
 * EnumWithFields::Transfer { amount: u64, recipient: pubkey }
 * Variant index 1 = "Transfer"
 */
function buildEnumWithFieldsData(): Uint8Array {
  const amountLE = new Uint8Array(8);
  new DataView(amountLE.buffer).setBigUint64(0, 5000n, true);
  return concat([1], amountLE, testPubkeyBytes); // variant 1 + u64 + pubkey
}

export const enumWithFieldsData = buildEnumWithFieldsData();

/**
 * Simple enum variant 0 = "Active"
 */
export const simpleEnumData = new Uint8Array([0]);
