import type { Idl, IdlTypeDef } from "@/types/idl";

/**
 * Well-known Solana program IDs that don't have on-chain Anchor IDLs.
 * We provide hardcoded IDL definitions so the decoder can parse their accounts.
 */

export const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

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
 * For non-Anchor programs, identify the account type by data size and owner.
 * Returns the type name and typeDef, or null if unrecognized.
 */
export function identifyBuiltinAccount(
  dataLength: number,
  owner: string,
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
  return null;
}

/** Check if a program ID has a built-in IDL */
export function getBuiltinIdl(programId: string): Idl | null {
  if (programId === TOKEN_PROGRAM_ID || programId === TOKEN_2022_PROGRAM_ID) {
    return splTokenIdl;
  }
  return null;
}
