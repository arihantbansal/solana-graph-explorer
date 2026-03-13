import type { Idl } from "@/types/idl";

/**
 * Minimal Anchor IDL fixture for testing account decoding.
 * Has a struct account type with various Borsh field types.
 */
export const tokenIdl: Idl = {
  address: "TokenFixture111111111111111111111111111111",
  metadata: {
    name: "test_token",
    version: "0.1.0",
    spec: "0.1.0",
  },
  instructions: [],
  accounts: [
    {
      name: "tokenAccount",
      discriminator: [0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0],
    },
    {
      name: "mintAccount",
      discriminator: [0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff, 0x00, 0x11],
    },
  ],
  types: [
    {
      name: "tokenAccount",
      type: {
        kind: "struct",
        fields: [
          { name: "authority", type: "pubkey" },
          { name: "amount", type: "u64" },
          { name: "decimals", type: "u8" },
          { name: "isInitialized", type: "bool" },
          { name: "name", type: "string" },
          { name: "optionalMemo", type: { option: "string" } },
          { name: "tags", type: { vec: "u8" } },
        ],
      },
    },
    {
      name: "mintAccount",
      type: {
        kind: "struct",
        fields: [
          { name: "supply", type: "u128" },
          { name: "decimals", type: "u8" },
          { name: "freezeAuthority", type: { option: "pubkey" } },
        ],
      },
    },
    {
      name: "nestedStruct",
      type: {
        kind: "struct",
        fields: [
          { name: "inner", type: { defined: { name: "innerData" } } },
          { name: "value", type: "u32" },
        ],
      },
    },
    {
      name: "innerData",
      type: {
        kind: "struct",
        fields: [
          { name: "x", type: "i32" },
          { name: "y", type: "i64" },
        ],
      },
    },
    {
      name: "withArray",
      type: {
        kind: "struct",
        fields: [
          { name: "fixedArr", type: { array: ["u16", 3] } },
        ],
      },
    },
    {
      name: "SimpleEnum",
      type: {
        kind: "enum",
        variants: [
          { name: "Active" },
          { name: "Inactive" },
          { name: "Pending" },
        ],
      },
    },
    {
      name: "EnumWithFields",
      type: {
        kind: "enum",
        variants: [
          { name: "None" },
          {
            name: "Transfer",
            fields: [
              { name: "amount", type: "u64" },
              { name: "recipient", type: "pubkey" },
            ],
          },
          {
            name: "Memo",
            fields: [
              { name: "text", type: "string" },
            ],
          },
        ],
      },
    },
    {
      name: "structWithEnum",
      type: {
        kind: "struct",
        fields: [
          { name: "status", type: { defined: { name: "SimpleEnum" } } },
          { name: "value", type: "u32" },
        ],
      },
    },
  ],
};
