import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchTransactions, isHeliusEndpoint, resetHeliusDetection } from "@/solana/fetchTransactions";

// Mock getRpc
const mockSend = vi.fn();
const mockGetSignaturesForAddress = vi.fn(() => ({ send: mockSend }));
const mockGetTransaction = vi.fn(() => ({ send: mockSend }));

vi.mock("@/solana/rpc", () => ({
  getRpc: () => ({
    getSignaturesForAddress: mockGetSignaturesForAddress,
    getTransaction: mockGetTransaction,
  }),
}));

// Mock @solana/kit address and signature helpers
vi.mock("@solana/kit", () => ({
  address: (a: string) => a,
  signature: (s: string) => s,
}));

// Mock IDL-related imports so decodeTransactionInstructions is a no-op
vi.mock("@/solana/idlCache", () => ({
  getIdl: () => null,
  setIdl: () => {},
}));
vi.mock("@/solana/fetchIdl", () => ({
  fetchIdl: () => Promise.resolve(null),
}));
vi.mock("@/engine/instructionDecoder", () => ({
  decodeInstruction: () => null,
}));

const TEST_ADDRESS = "11111111111111111111111111111111";
const TEST_RPC = "https://test-rpc.example.com";

function makeHeliusTx(overrides: Record<string, unknown> = {}) {
  return {
    slot: 100,
    blockTime: 1700000000,
    meta: { err: null, fee: 5000, logMessages: [], preBalances: [], postBalances: [], innerInstructions: [], preTokenBalances: [], postTokenBalances: [] },
    transaction: { signatures: ["sig1abc"], message: { accountKeys: ["addr1"], instructions: [] } },
    ...overrides,
  };
}

describe("fetchTransactions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetHeliusDetection();
    mockSend.mockReset();
    mockGetSignaturesForAddress.mockReset();
    mockGetTransaction.mockReset();
  });

  describe("Helius detection", () => {
    it("detects Helius endpoint on successful response with data array", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            result: {
              data: [makeHeliusTx()],
              paginationToken: null,
            },
          }),
      });
      globalThis.fetch = mockFetch;

      const result = await fetchTransactions(TEST_ADDRESS, TEST_RPC);
      expect(isHeliusEndpoint()).toBe(true);
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].signature).toBe("sig1abc");
    });

    it("falls back to standard RPC on method-not-found error", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            error: { code: -32601, message: "Method not found" },
          }),
      });
      globalThis.fetch = mockFetch;

      // Setup standard RPC mock
      mockGetSignaturesForAddress.mockReturnValue({
        send: () =>
          Promise.resolve([
            { signature: "stdSig1", slot: 200, blockTime: 1700000000, err: null },
          ]),
      });
      mockGetTransaction.mockReturnValue({
        send: () =>
          Promise.resolve({
            slot: 200,
            blockTime: 1700000000,
            meta: {
              err: null,
              fee: 5000,
              logMessages: ["log1"],
              preBalances: [100],
              postBalances: [95],
              innerInstructions: [],
              preTokenBalances: [],
              postTokenBalances: [],
            },
            transaction: {
              message: {
                accountKeys: ["addr1", "addr2"],
                instructions: [{ programIdIndex: 1, accounts: [0], data: "abc" }],
              },
            },
          }),
      });

      const result = await fetchTransactions(TEST_ADDRESS, TEST_RPC);
      expect(isHeliusEndpoint()).toBe(false);
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].signature).toBe("stdSig1");
    });
  });

  describe("Standard RPC path", () => {
    beforeEach(() => {
      // Force standard path by making Helius fail
      const mockFetch = vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            error: { code: -32601, message: "Method not found" },
          }),
      });
      globalThis.fetch = mockFetch;
    });

    it("returns empty when no signatures found", async () => {
      mockGetSignaturesForAddress.mockReturnValue({
        send: () => Promise.resolve([]),
      });

      const result = await fetchTransactions(TEST_ADDRESS, TEST_RPC);
      expect(result.transactions).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });

    it("passes before parameter for pagination", async () => {
      mockGetSignaturesForAddress.mockReturnValue({
        send: () => Promise.resolve([]),
      });

      await fetchTransactions(TEST_ADDRESS, TEST_RPC, { before: "oldSig", limit: 10 });
      expect(mockGetSignaturesForAddress).toHaveBeenCalledWith(
        TEST_ADDRESS,
        expect.objectContaining({ before: "oldSig", limit: 10 }),
      );
    });

    it("fetches transactions in parallel", async () => {
      mockGetSignaturesForAddress.mockReturnValue({
        send: () =>
          Promise.resolve([
            { signature: "sig1", slot: 300, blockTime: 1700000000, err: null },
            { signature: "sig2", slot: 301, blockTime: 1700000001, err: null },
          ]),
      });
      mockGetTransaction.mockImplementation(() => ({
        send: () =>
          Promise.resolve({
            slot: 300,
            blockTime: 1700000000,
            meta: {
              err: null, fee: 5000, logMessages: [], preBalances: [], postBalances: [],
              innerInstructions: [], preTokenBalances: [], postTokenBalances: [],
            },
            transaction: { message: { accountKeys: ["addr1"], instructions: [] } },
          }),
      }));

      const result = await fetchTransactions(TEST_ADDRESS, TEST_RPC);
      expect(result.transactions).toHaveLength(2);
      // Both getTransaction calls should have been made
      expect(mockGetTransaction).toHaveBeenCalledTimes(2);
    });

    it("maps v0 transactions with loaded addresses", async () => {
      mockGetSignaturesForAddress.mockReturnValue({
        send: () =>
          Promise.resolve([
            { signature: "v0Sig", slot: 300, blockTime: 1700000000, err: null },
          ]),
      });
      mockGetTransaction.mockReturnValue({
        send: () =>
          Promise.resolve({
            slot: 300,
            blockTime: 1700000000,
            meta: {
              err: null,
              fee: 5000,
              logMessages: [],
              preBalances: [],
              postBalances: [],
              innerInstructions: [],
              preTokenBalances: [],
              postTokenBalances: [],
              loadedAddresses: {
                writable: ["writableAddr"],
                readonly: ["readonlyAddr"],
              },
            },
            transaction: {
              message: {
                accountKeys: ["staticAddr"],
                instructions: [],
              },
            },
          }),
      });

      const result = await fetchTransactions(TEST_ADDRESS, TEST_RPC);
      expect(result.transactions[0].accountKeys).toEqual([
        "staticAddr",
        "writableAddr",
        "readonlyAddr",
      ]);
    });
  });

  describe("Helius pagination", () => {
    it("uses paginationToken for hasMore", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            result: {
              data: [makeHeliusTx()],
              paginationToken: "100:5",
            },
          }),
      });
      globalThis.fetch = mockFetch;

      const result = await fetchTransactions(TEST_ADDRESS, TEST_RPC, { limit: 20 });
      expect(result.hasMore).toBe(true);
      expect(result.oldestSignature).toBe("100:5");
    });

    it("sets hasMore false when no paginationToken and under limit", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            result: {
              data: [makeHeliusTx()],
              paginationToken: null,
            },
          }),
      });
      globalThis.fetch = mockFetch;

      const result = await fetchTransactions(TEST_ADDRESS, TEST_RPC, { limit: 20 });
      expect(result.hasMore).toBe(false);
    });
  });
});
