import type { Idl, IdlInstruction, IdlTypeDef } from "@/types/idl";

/**
 * Well-known Solana program IDs that don't have on-chain Anchor IDLs.
 * We provide hardcoded IDL definitions so the decoder can parse their accounts and instructions.
 */

export const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
export const METAPLEX_METADATA_PROGRAM_ID = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";
export const SQUADS_V4_PROGRAM_ID = "SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf";
export const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";
export const ASSOCIATED_TOKEN_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
export const MEMO_V1_PROGRAM_ID = "Memo1UhkJBfCR6MNLc2CfVBwGtRwk6KXqmdHnsvNFLy";
export const MEMO_V2_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
export const COMPUTE_BUDGET_PROGRAM_ID = "ComputeBudget111111111111111111111111111111";

// ─── Helper: u32 LE discriminator tag ──────────────────────────────

function u32Tag(n: number): number[] {
  return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff];
}

// ─── System Program instructions ────────────────────────────────────

const systemInstructions: IdlInstruction[] = [
  {
    name: "createAccount",
    discriminator: u32Tag(0),
    accounts: [
      { name: "from", writable: true, signer: true },
      { name: "to", writable: true, signer: true },
    ],
    args: [
      { name: "lamports", type: "u64" },
      { name: "space", type: "u64" },
      { name: "owner", type: "pubkey" },
    ],
  },
  {
    name: "assign",
    discriminator: u32Tag(1),
    accounts: [
      { name: "account", writable: true, signer: true },
    ],
    args: [
      { name: "owner", type: "pubkey" },
    ],
  },
  {
    name: "transfer",
    discriminator: u32Tag(2),
    accounts: [
      { name: "from", writable: true, signer: true },
      { name: "to", writable: true },
    ],
    args: [
      { name: "lamports", type: "u64" },
    ],
  },
  {
    name: "createAccountWithSeed",
    discriminator: u32Tag(3),
    accounts: [
      { name: "from", writable: true, signer: true },
      { name: "to", writable: true },
      { name: "base", signer: true },
    ],
    args: [
      { name: "base", type: "pubkey" },
      { name: "seed", type: "string" },
      { name: "lamports", type: "u64" },
      { name: "space", type: "u64" },
      { name: "owner", type: "pubkey" },
    ],
  },
  {
    name: "advanceNonceAccount",
    discriminator: u32Tag(4),
    accounts: [
      { name: "nonce", writable: true },
      { name: "recentBlockhashes" },
      { name: "authority", signer: true },
    ],
    args: [],
  },
  {
    name: "withdrawNonceAccount",
    discriminator: u32Tag(5),
    accounts: [
      { name: "nonce", writable: true },
      { name: "to", writable: true },
      { name: "recentBlockhashes" },
      { name: "rent" },
      { name: "authority", signer: true },
    ],
    args: [
      { name: "lamports", type: "u64" },
    ],
  },
  {
    name: "initializeNonceAccount",
    discriminator: u32Tag(6),
    accounts: [
      { name: "nonce", writable: true },
      { name: "recentBlockhashes" },
      { name: "rent" },
    ],
    args: [
      { name: "authority", type: "pubkey" },
    ],
  },
  {
    name: "authorizeNonceAccount",
    discriminator: u32Tag(7),
    accounts: [
      { name: "nonce", writable: true },
      { name: "authority", signer: true },
    ],
    args: [
      { name: "newAuthority", type: "pubkey" },
    ],
  },
  {
    name: "allocate",
    discriminator: u32Tag(8),
    accounts: [
      { name: "account", writable: true, signer: true },
    ],
    args: [
      { name: "space", type: "u64" },
    ],
  },
  {
    name: "allocateWithSeed",
    discriminator: u32Tag(9),
    accounts: [
      { name: "account", writable: true },
      { name: "base", signer: true },
    ],
    args: [
      { name: "base", type: "pubkey" },
      { name: "seed", type: "string" },
      { name: "space", type: "u64" },
      { name: "owner", type: "pubkey" },
    ],
  },
  {
    name: "assignWithSeed",
    discriminator: u32Tag(10),
    accounts: [
      { name: "account", writable: true },
      { name: "base", signer: true },
    ],
    args: [
      { name: "base", type: "pubkey" },
      { name: "seed", type: "string" },
      { name: "owner", type: "pubkey" },
    ],
  },
  {
    name: "transferWithSeed",
    discriminator: u32Tag(11),
    accounts: [
      { name: "from", writable: true },
      { name: "base", signer: true },
      { name: "to", writable: true },
    ],
    args: [
      { name: "lamports", type: "u64" },
      { name: "fromSeed", type: "string" },
      { name: "fromOwner", type: "pubkey" },
    ],
  },
  {
    name: "upgradeNonceAccount",
    discriminator: u32Tag(12),
    accounts: [
      { name: "nonce", writable: true },
    ],
    args: [],
  },
];

export const systemProgramIdl: Idl = {
  address: SYSTEM_PROGRAM_ID,
  metadata: { name: "system_program", version: "1.0.0" },
  instructions: systemInstructions,
  accounts: [],
  types: [],
};

// ─── SPL Token instructions (shared by Token and Token-2022) ────────

const splTokenInstructions: IdlInstruction[] = [
  {
    name: "initializeMint",
    discriminator: [0],
    accounts: [
      { name: "mint", writable: true },
      { name: "rent" },
    ],
    args: [
      { name: "decimals", type: "u8" },
      { name: "mintAuthority", type: "pubkey" },
      { name: "freezeAuthority", type: { coption: "pubkey" } },
    ],
  },
  {
    name: "initializeAccount",
    discriminator: [1],
    accounts: [
      { name: "account", writable: true },
      { name: "mint" },
      { name: "owner" },
      { name: "rent" },
    ],
    args: [],
  },
  // initializeMultisig = 2 (rarely used, skip for now)
  {
    name: "transfer",
    discriminator: [3],
    accounts: [
      { name: "source", writable: true },
      { name: "destination", writable: true },
      { name: "authority", signer: true },
    ],
    args: [
      { name: "amount", type: "u64" },
    ],
  },
  {
    name: "approve",
    discriminator: [4],
    accounts: [
      { name: "source", writable: true },
      { name: "delegate" },
      { name: "authority", signer: true },
    ],
    args: [
      { name: "amount", type: "u64" },
    ],
  },
  {
    name: "revoke",
    discriminator: [5],
    accounts: [
      { name: "source", writable: true },
      { name: "authority", signer: true },
    ],
    args: [],
  },
  {
    name: "setAuthority",
    discriminator: [6],
    accounts: [
      { name: "account", writable: true },
      { name: "currentAuthority", signer: true },
    ],
    args: [
      { name: "authorityType", type: "u8" },
      { name: "newAuthority", type: { coption: "pubkey" } },
    ],
  },
  {
    name: "mintTo",
    discriminator: [7],
    accounts: [
      { name: "mint", writable: true },
      { name: "account", writable: true },
      { name: "mintAuthority", signer: true },
    ],
    args: [
      { name: "amount", type: "u64" },
    ],
  },
  {
    name: "burn",
    discriminator: [8],
    accounts: [
      { name: "account", writable: true },
      { name: "mint", writable: true },
      { name: "authority", signer: true },
    ],
    args: [
      { name: "amount", type: "u64" },
    ],
  },
  {
    name: "closeAccount",
    discriminator: [9],
    accounts: [
      { name: "account", writable: true },
      { name: "destination", writable: true },
      { name: "authority", signer: true },
    ],
    args: [],
  },
  {
    name: "freezeAccount",
    discriminator: [10],
    accounts: [
      { name: "account", writable: true },
      { name: "mint" },
      { name: "freezeAuthority", signer: true },
    ],
    args: [],
  },
  {
    name: "thawAccount",
    discriminator: [11],
    accounts: [
      { name: "account", writable: true },
      { name: "mint" },
      { name: "freezeAuthority", signer: true },
    ],
    args: [],
  },
  {
    name: "transferChecked",
    discriminator: [12],
    accounts: [
      { name: "source", writable: true },
      { name: "mint" },
      { name: "destination", writable: true },
      { name: "authority", signer: true },
    ],
    args: [
      { name: "amount", type: "u64" },
      { name: "decimals", type: "u8" },
    ],
  },
  {
    name: "approveChecked",
    discriminator: [13],
    accounts: [
      { name: "source", writable: true },
      { name: "mint" },
      { name: "delegate" },
      { name: "authority", signer: true },
    ],
    args: [
      { name: "amount", type: "u64" },
      { name: "decimals", type: "u8" },
    ],
  },
  {
    name: "mintToChecked",
    discriminator: [14],
    accounts: [
      { name: "mint", writable: true },
      { name: "account", writable: true },
      { name: "mintAuthority", signer: true },
    ],
    args: [
      { name: "amount", type: "u64" },
      { name: "decimals", type: "u8" },
    ],
  },
  {
    name: "burnChecked",
    discriminator: [15],
    accounts: [
      { name: "account", writable: true },
      { name: "mint", writable: true },
      { name: "authority", signer: true },
    ],
    args: [
      { name: "amount", type: "u64" },
      { name: "decimals", type: "u8" },
    ],
  },
  {
    name: "initializeAccount2",
    discriminator: [16],
    accounts: [
      { name: "account", writable: true },
      { name: "mint" },
      { name: "rent" },
    ],
    args: [
      { name: "owner", type: "pubkey" },
    ],
  },
  {
    name: "syncNative",
    discriminator: [17],
    accounts: [
      { name: "account", writable: true },
    ],
    args: [],
  },
  {
    name: "initializeAccount3",
    discriminator: [18],
    accounts: [
      { name: "account", writable: true },
      { name: "mint" },
    ],
    args: [
      { name: "owner", type: "pubkey" },
    ],
  },
  // initializeMultisig2 = 19 (rarely used)
  {
    name: "initializeMint2",
    discriminator: [20],
    accounts: [
      { name: "mint", writable: true },
    ],
    args: [
      { name: "decimals", type: "u8" },
      { name: "mintAuthority", type: "pubkey" },
      { name: "freezeAuthority", type: { coption: "pubkey" } },
    ],
  },
  // getAccountDataSize = 21 (query, not a mutation)
  {
    name: "initializeImmutableOwner",
    discriminator: [22],
    accounts: [
      { name: "account", writable: true },
    ],
    args: [],
  },
  // amountToUiAmount = 23 (query)
  // uiAmountToAmount = 24 (query)
];

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
  instructions: splTokenInstructions,
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

/** Token-2022 shares the same base instruction set as SPL Token */
export const token2022Idl: Idl = {
  address: TOKEN_2022_PROGRAM_ID,
  metadata: {
    name: "spl_token_2022",
    version: "1.0.0",
  },
  instructions: splTokenInstructions,
  accounts: splTokenIdl.accounts,
  types: splTokenIdl.types,
};

/** Data sizes for SPL Token account types */
const MINT_SIZE = 82;
const TOKEN_ACCOUNT_SIZE = 165;

// ─── Associated Token Account instructions ──────────────────────────

const ataInstructions: IdlInstruction[] = [
  {
    name: "create",
    discriminator: [0],
    accounts: [
      { name: "fundingAccount", writable: true, signer: true },
      { name: "associatedTokenAccount", writable: true },
      { name: "wallet" },
      { name: "mint" },
      { name: "systemProgram" },
      { name: "tokenProgram" },
    ],
    args: [],
  },
  {
    name: "createIdempotent",
    discriminator: [1],
    accounts: [
      { name: "fundingAccount", writable: true, signer: true },
      { name: "associatedTokenAccount", writable: true },
      { name: "wallet" },
      { name: "mint" },
      { name: "systemProgram" },
      { name: "tokenProgram" },
    ],
    args: [],
  },
  {
    name: "recoverNested",
    discriminator: [2],
    accounts: [
      { name: "nestedAssociatedTokenAccount", writable: true },
      { name: "nestedMint" },
      { name: "destinationAssociatedTokenAccount", writable: true },
      { name: "ownerAssociatedTokenAccount" },
      { name: "ownerMint" },
      { name: "wallet", signer: true },
      { name: "tokenProgram" },
    ],
    args: [],
  },
];

export const ataIdl: Idl = {
  address: ASSOCIATED_TOKEN_PROGRAM_ID,
  metadata: { name: "associated_token_account", version: "1.0.0" },
  instructions: ataInstructions,
  accounts: [],
  types: [],
};

// ─── Memo programs ──────────────────────────────────────────────────

const memoInstruction: IdlInstruction = {
  name: "memo",
  discriminator: [], // empty = entire data is UTF-8 text
  accounts: [],
  args: [],
};

export const memoV1Idl: Idl = {
  address: MEMO_V1_PROGRAM_ID,
  metadata: { name: "spl_memo", version: "1.0.0" },
  instructions: [memoInstruction],
  accounts: [],
  types: [],
};

export const memoV2Idl: Idl = {
  address: MEMO_V2_PROGRAM_ID,
  metadata: { name: "spl_memo", version: "2.0.0" },
  instructions: [memoInstruction],
  accounts: [],
  types: [],
};

// ─── Compute Budget instructions ────────────────────────────────────

const computeBudgetInstructions: IdlInstruction[] = [
  {
    name: "requestHeapFrame",
    discriminator: [1],
    accounts: [],
    args: [
      { name: "bytes", type: "u32" },
    ],
  },
  {
    name: "setComputeUnitLimit",
    discriminator: [2],
    accounts: [],
    args: [
      { name: "units", type: "u32" },
    ],
  },
  {
    name: "setComputeUnitPrice",
    discriminator: [3],
    accounts: [],
    args: [
      { name: "microLamports", type: "u64" },
    ],
  },
  {
    name: "setLoadedAccountsDataSizeLimit",
    discriminator: [4],
    accounts: [],
    args: [
      { name: "bytes", type: "u32" },
    ],
  },
];

export const computeBudgetIdl: Idl = {
  address: COMPUTE_BUDGET_PROGRAM_ID,
  metadata: { name: "compute_budget", version: "1.0.0" },
  instructions: computeBudgetInstructions,
  accounts: [],
  types: [],
};

// ─── Metaplex Token Metadata instructions ───────────────────────────

const metaplexInstructions: IdlInstruction[] = [
  {
    name: "updateMetadataAccountV2",
    discriminator: [15],
    accounts: [
      { name: "metadata", writable: true },
      { name: "updateAuthority", signer: true },
    ],
    args: [
      { name: "data", type: { option: { defined: { name: "DataV2" } } } },
      { name: "newUpdateAuthority", type: { option: "pubkey" } },
      { name: "primarySaleHappened", type: { option: "bool" } },
      { name: "isMutable", type: { option: "bool" } },
    ],
  },
  {
    name: "createMasterEditionV3",
    discriminator: [17],
    accounts: [
      { name: "edition", writable: true },
      { name: "mint", writable: true },
      { name: "updateAuthority", signer: true },
      { name: "mintAuthority", signer: true },
      { name: "payer", writable: true, signer: true },
      { name: "metadata" },
      { name: "tokenProgram" },
      { name: "systemProgram" },
      { name: "rent" },
    ],
    args: [
      { name: "maxSupply", type: { option: "u64" } },
    ],
  },
  {
    name: "verifyCollection",
    discriminator: [18],
    accounts: [
      { name: "metadata", writable: true },
      { name: "collectionAuthority", signer: true },
      { name: "payer", writable: true, signer: true },
      { name: "collectionMint" },
      { name: "collection" },
      { name: "collectionMasterEdition" },
    ],
    args: [],
  },
  {
    name: "setAndVerifyCollection",
    discriminator: [25],
    accounts: [
      { name: "metadata", writable: true },
      { name: "collectionAuthority", signer: true },
      { name: "payer", writable: true, signer: true },
      { name: "updateAuthority" },
      { name: "collectionMint" },
      { name: "collection" },
      { name: "collectionMasterEdition" },
    ],
    args: [],
  },
  {
    name: "verifySizedCollectionItem",
    discriminator: [30],
    accounts: [
      { name: "metadata", writable: true },
      { name: "collectionAuthority", signer: true },
      { name: "payer", writable: true, signer: true },
      { name: "collectionMint" },
      { name: "collection", writable: true },
      { name: "collectionMasterEdition" },
    ],
    args: [],
  },
  {
    name: "unverifySizedCollectionItem",
    discriminator: [31],
    accounts: [
      { name: "metadata", writable: true },
      { name: "collectionAuthority", signer: true },
      { name: "payer", writable: true, signer: true },
      { name: "collectionMint" },
      { name: "collection", writable: true },
      { name: "collectionMasterEdition" },
    ],
    args: [],
  },
  {
    name: "createMetadataAccountV3",
    discriminator: [33],
    accounts: [
      { name: "metadata", writable: true },
      { name: "mint" },
      { name: "mintAuthority", signer: true },
      { name: "payer", writable: true, signer: true },
      { name: "updateAuthority" },
      { name: "systemProgram" },
      { name: "rent" },
    ],
    args: [
      { name: "data", type: { defined: { name: "DataV2" } } },
      { name: "isMutable", type: "bool" },
      { name: "collectionDetails", type: { option: { defined: { name: "CollectionDetails" } } } },
    ],
  },
];

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
  instructions: metaplexInstructions,
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
    {
      name: "DataV2",
      type: {
        kind: "struct",
        fields: [
          { name: "name", type: "string" },
          { name: "symbol", type: "string" },
          { name: "uri", type: "string" },
          { name: "sellerFeeBasisPoints", type: "u16" },
          { name: "creators", type: { option: { vec: { defined: "Creator" } } } },
          { name: "collection", type: { option: { defined: "Collection" } } },
          { name: "uses", type: { option: { defined: "Uses" } } },
        ],
      },
    },
    {
      name: "CollectionDetails",
      type: {
        kind: "enum",
        variants: [
          { name: "V1", fields: [{ name: "size", type: "u64" }] },
        ],
      },
    },
  ],
};

/**
 * Squads Multisig V4 program IDL.
 *
 * Anchor program — accounts identified by 8-byte discriminator.
 * Discriminator = sha256("account:<TypeName>")[0..8]
 *
 * Multisig account: the main config account for a Squad.
 * Members is a variable-length Vec<Member>.
 * Member.permissions is a bitmask: 1=Propose, 2=Vote, 4=Execute (7=All).
 */
export const squadsV4Idl: Idl = {
  address: SQUADS_V4_PROGRAM_ID,
  metadata: {
    name: "squads_multisig_program",
    version: "4.0.0",
  },
  instructions: [],
  accounts: [
    // sha256("account:Multisig")[0..8] = [224, 116, 121, 186, 68, 161, 79, 236]
    { name: "Multisig", discriminator: [224, 116, 121, 186, 68, 161, 79, 236] },
  ],
  types: [
    {
      name: "Multisig",
      type: {
        kind: "struct",
        fields: [
          { name: "createKey", type: "pubkey" },
          { name: "configAuthority", type: "pubkey" },
          { name: "threshold", type: "u16" },
          { name: "timeLock", type: "u32" },
          { name: "transactionIndex", type: "u64" },
          { name: "staleTransactionIndex", type: "u64" },
          { name: "rentCollector", type: { option: "pubkey" } },
          { name: "bump", type: "u8" },
          { name: "members", type: { vec: { defined: "Member" } } },
        ],
      },
    },
    {
      name: "Member",
      type: {
        kind: "struct",
        fields: [
          { name: "key", type: "pubkey" },
          { name: "permissions", type: "u8" },
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

  // Squads V4: Anchor program with standard 8-byte discriminators
  if (owner === SQUADS_V4_PROGRAM_ID && data && data.length >= 8) {
    const disc = squadsV4Idl.accounts![0].discriminator;
    let match = true;
    for (let i = 0; i < 8; i++) {
      if (data[i] !== disc[i]) { match = false; break; }
    }
    if (match) {
      const typeDef = squadsV4Idl.types!.find((t) => t.name === "Multisig")!;
      return { name: "Multisig", typeDef, idl: squadsV4Idl };
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

/** Lookup map for all built-in IDLs */
const BUILTIN_IDL_MAP: Record<string, Idl> = {
  [SYSTEM_PROGRAM_ID]: systemProgramIdl,
  [TOKEN_PROGRAM_ID]: splTokenIdl,
  [TOKEN_2022_PROGRAM_ID]: token2022Idl,
  [ASSOCIATED_TOKEN_PROGRAM_ID]: ataIdl,
  [MEMO_V1_PROGRAM_ID]: memoV1Idl,
  [MEMO_V2_PROGRAM_ID]: memoV2Idl,
  [COMPUTE_BUDGET_PROGRAM_ID]: computeBudgetIdl,
  [METAPLEX_METADATA_PROGRAM_ID]: metaplexMetadataIdl,
  [SQUADS_V4_PROGRAM_ID]: squadsV4Idl,
};

/** Check if a program ID has a built-in IDL */
export function getBuiltinIdl(programId: string): Idl | null {
  return BUILTIN_IDL_MAP[programId] ?? null;
}
