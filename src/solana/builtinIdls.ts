import type { Idl, IdlTypeDef } from "@/types/idl";

/**
 * Well-known Solana program IDs that don't have on-chain Anchor IDLs.
 * We provide hardcoded IDL definitions so the decoder can parse their accounts.
 */

export const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
export const METAPLEX_METADATA_PROGRAM_ID = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";

/**
 * SPL Token program IDL.
 *
 * SPL Token accounts are NOT Anchor accounts — they have no 8-byte discriminator.
 * Account type is identified by data length + owner program:
 *   - Mint: 82 bytes
 *   - Token Account: 165 bytes
 *
 * COption<T> uses a u32 tag (0=None, 1=Some), NOT a u8 tag like Borsh Option<T>.
 */
export const splTokenIdl: Idl = {
  address: TOKEN_PROGRAM_ID,
  metadata: {
    name: "spl_token",
    version: "1.0.0",
  },
  instructions: [],
  accounts: [
    { name: "mint", discriminator: [] },
    { name: "tokenAccount", discriminator: [] },
  ],
  types: [
    {
      name: "mint",
      type: {
        kind: "struct",
        fields: [
          { name: "mintAuthority", type: { coption: "pubkey" } },
          { name: "supply", type: "u64" },
          { name: "decimals", type: "u8" },
          { name: "isInitialized", type: "bool" },
          { name: "freezeAuthority", type: { coption: "pubkey" } },
        ],
      },
    },
    {
      name: "tokenAccount",
      type: {
        kind: "struct",
        fields: [
          { name: "mint", type: "pubkey" },
          { name: "owner", type: "pubkey" },
          { name: "amount", type: "u64" },
          { name: "delegate", type: { coption: "pubkey" } },
          { name: "state", type: "u8" },
          { name: "isNative", type: { coption: "u64" } },
          { name: "delegatedAmount", type: "u64" },
          { name: "closeAuthority", type: { coption: "pubkey" } },
        ],
      },
    },
  ],
};

/** Data sizes for SPL Token account types */
const MINT_SIZE = 82;
const TOKEN_ACCOUNT_SIZE = 165;

/**
 * Metaplex Token Metadata program IDL.
 *
 * Non-Anchor program — account type identified by owner + first byte (key field):
 *   - MetadataV1: key = 4
 *   - MasterEditionV2: key = 6
 *   - EditionV1 (print): key = 1
 *
 * Strings (name, symbol, uri) are null-padded to fixed sizes by the program.
 * After decoding, trailing null bytes must be trimmed from string fields.
 */
export const metaplexMetadataIdl: Idl = {
  address: METAPLEX_METADATA_PROGRAM_ID,
  metadata: {
    name: "metaplex_token_metadata",
    version: "1.0.0",
  },
  instructions: [],
  accounts: [
    { name: "metadata", discriminator: [] },
    { name: "masterEdition", discriminator: [] },
    { name: "edition", discriminator: [] },
  ],
  types: [
    {
      name: "metadata",
      type: {
        kind: "struct",
        fields: [
          { name: "key", type: "u8" },
          { name: "updateAuthority", type: "pubkey" },
          { name: "mint", type: "pubkey" },
          // Data fields inlined (avoids extra nesting in UI)
          { name: "name", type: "string" },
          { name: "symbol", type: "string" },
          { name: "uri", type: "string" },
          { name: "sellerFeeBasisPoints", type: "u16" },
          { name: "creators", type: { option: { vec: { defined: "Creator" } } } },
          // End Data
          { name: "primarySaleHappened", type: "bool" },
          { name: "isMutable", type: "bool" },
          { name: "editionNonce", type: { option: "u8" } },
          { name: "tokenStandard", type: { option: "u8" } },
          { name: "collection", type: { option: { defined: "Collection" } } },
          { name: "uses", type: { option: { defined: "Uses" } } },
        ],
      },
    },
    {
      name: "masterEdition",
      type: {
        kind: "struct",
        fields: [
          { name: "key", type: "u8" },
          { name: "supply", type: "u64" },
          { name: "maxSupply", type: { option: "u64" } },
        ],
      },
    },
    {
      name: "edition",
      type: {
        kind: "struct",
        fields: [
          { name: "key", type: "u8" },
          { name: "parent", type: "pubkey" },
          { name: "edition", type: "u64" },
        ],
      },
    },
    {
      name: "Creator",
      type: {
        kind: "struct",
        fields: [
          { name: "address", type: "pubkey" },
          { name: "verified", type: "bool" },
          { name: "share", type: "u8" },
        ],
      },
    },
    {
      name: "Collection",
      type: {
        kind: "struct",
        fields: [
          { name: "verified", type: "bool" },
          { name: "key", type: "pubkey" },
        ],
      },
    },
    {
      name: "Uses",
      type: {
        kind: "struct",
        fields: [
          { name: "useMethod", type: "u8" },
          { name: "remaining", type: "u64" },
          { name: "total", type: "u64" },
        ],
      },
    },
  ],
};

/** Metaplex key byte → account type mapping */
const METAPLEX_KEY_MAP: Record<number, string> = {
  4: "metadata",
  6: "masterEdition",
  1: "edition",
};

/**
 * For non-Anchor programs, identify the account type by data size and owner.
 * Returns the type name and typeDef, or null if unrecognized.
 */
export function identifyBuiltinAccount(
  dataLength: number,
  owner: string,
  data?: Uint8Array,
): { name: string; typeDef: IdlTypeDef; idl: Idl } | null {
  if (owner === TOKEN_PROGRAM_ID || owner === TOKEN_2022_PROGRAM_ID) {
    if (dataLength === MINT_SIZE) {
      const typeDef = splTokenIdl.types!.find((t) => t.name === "mint")!;
      return { name: "mint", typeDef, idl: splTokenIdl };
    }
    if (dataLength >= TOKEN_ACCOUNT_SIZE) {
      const typeDef = splTokenIdl.types!.find((t) => t.name === "tokenAccount")!;
      return { name: "tokenAccount", typeDef, idl: splTokenIdl };
    }
  }

  if (owner === METAPLEX_METADATA_PROGRAM_ID && data && data.length > 0) {
    const keyByte = data[0];
    const typeName = METAPLEX_KEY_MAP[keyByte];
    if (typeName) {
      const typeDef = metaplexMetadataIdl.types!.find((t) => t.name === typeName);
      if (typeDef) {
        return { name: typeName, typeDef, idl: metaplexMetadataIdl };
      }
    }
  }

  return null;
}

/**
 * Trim trailing null bytes from all string values in decoded data (recursive).
 * Metaplex pads strings to fixed sizes with \0 bytes.
 */
export function trimNullPaddedStrings(obj: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      obj[key] = value.replace(/\0+$/, "");
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "object" && item !== null && !(item instanceof Uint8Array)) {
          trimNullPaddedStrings(item as Record<string, unknown>);
        }
      }
    } else if (typeof value === "object" && value !== null && !(value instanceof Uint8Array)) {
      trimNullPaddedStrings(value as Record<string, unknown>);
    }
  }
}

/** Check if a program ID has a built-in IDL */
export function getBuiltinIdl(programId: string): Idl | null {
  if (programId === TOKEN_PROGRAM_ID || programId === TOKEN_2022_PROGRAM_ID) {
    return splTokenIdl;
  }
  if (programId === METAPLEX_METADATA_PROGRAM_ID) {
    return metaplexMetadataIdl;
  }
  return null;
}
