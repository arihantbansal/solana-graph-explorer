import type { ParsedTransaction, TransactionPage, ParsedInstruction, InnerInstructionSet, TokenBalance } from "@/types/transaction";
import type { Idl } from "@/types/idl";
import { getRpc } from "./rpc";
import { getIdl } from "./idlCache";
import { fetchIdl } from "./fetchIdl";
import { setIdl } from "./idlCache";
import { decodeInstruction } from "@/engine/instructionDecoder";
import { address, signature } from "@solana/kit";

// Cache whether the current RPC supports Helius-specific methods
let heliusDetected: boolean | null = null;
let detectedForUrl: string = "";

/**
 * Check if the current RPC endpoint supports Helius features.
 * Only valid after at least one fetchTransactions call.
 */
export function isHeliusEndpoint(): boolean {
  return heliusDetected === true;
}

/**
 * Reset helius detection (useful for testing or when RPC URL changes).
 */
export function resetHeliusDetection(): void {
  heliusDetected = null;
  detectedForUrl = "";
}

/**
 * Fetch transaction history for an address.
 * Tries Helius getTransactionsForAddress (full tx data in one call),
 * falls back to standard getSignaturesForAddress + parallel getTransaction.
 */
export async function fetchTransactions(
  addr: string,
  rpcUrl: string,
  options?: { before?: string; limit?: number },
): Promise<TransactionPage> {
  const limit = options?.limit ?? 20;

  // Reset detection if URL changed
  if (rpcUrl !== detectedForUrl) {
    heliusDetected = null;
    detectedForUrl = rpcUrl;
  }

  // If we haven't detected yet, try Helius first
  if (heliusDetected === null) {
    try {
      const result = await fetchViaHelius(addr, rpcUrl, limit, options?.before);
      heliusDetected = true;
      return result;
    } catch (e: unknown) {
      if (isMethodNotFound(e)) {
        heliusDetected = false;
      } else {
        throw e;
      }
    }
  }

  if (heliusDetected) {
    return fetchViaHelius(addr, rpcUrl, limit, options?.before);
  }

  const page = await fetchViaStandardRpc(addr, rpcUrl, limit, options?.before);

  // Decode instructions using cached IDLs
  await decodeTransactionInstructions(page.transactions, rpcUrl);

  return page;
}

function isMethodNotFound(e: unknown): boolean {
  if (e && typeof e === "object" && "code" in e && (e as { code: number }).code === -32601) {
    return true;
  }
  if (e instanceof Error && e.message.includes("-32601")) {
    return true;
  }
  return false;
}

/**
 * Try to decode instructions in fetched transactions using IDLs.
 * Mutates the transactions in place.
 */
async function decodeTransactionInstructions(
  transactions: ParsedTransaction[],
  rpcUrl: string,
): Promise<void> {
  // Collect unique program IDs
  const programIds = new Set<string>();
  for (const tx of transactions) {
    for (const ix of tx.instructions) {
      programIds.add(ix.programId);
    }
  }

  // Fetch any missing IDLs in parallel
  const idlMap = new Map<string, Idl>();
  await Promise.all(
    [...programIds].map(async (pid) => {
      let idl = getIdl(pid);
      if (!idl) {
        try {
          idl = await fetchIdl(pid, rpcUrl);
          if (idl) setIdl(pid, idl);
        } catch {
          // IDL fetch failed — skip
        }
      }
      if (idl) idlMap.set(pid, idl);
    }),
  );

  // Decode each instruction
  for (const tx of transactions) {
    for (const ix of tx.instructions) {
      if (ix.decoded) continue;
      const idl = idlMap.get(ix.programId);
      if (!idl) continue;
      const decoded = decodeInstruction(ix, idl);
      if (decoded) {
        ix.decoded = decoded;
      }
    }
  }
}

// --- Helius path: single call returns full transaction data ---

async function fetchViaHelius(
  addr: string,
  rpcUrl: string,
  limit: number,
  before?: string,
): Promise<TransactionPage> {
  const options: Record<string, unknown> = {
    transactionDetails: "full",
    limit,
  };
  if (before) options.paginationToken = before;

  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "getTransactionsForAddress",
    params: [addr, options],
  };

  const resp = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = await resp.json();

  if (json.error) {
    const err = new Error(json.error.message || "RPC error");
    (err as unknown as Record<string, unknown>).code = json.error.code;
    throw err;
  }

  // Helius wraps results in { data: [...], paginationToken }
  const result = json.result;
  if (!result || typeof result !== "object") {
    const err = new Error("Method not found");
    (err as unknown as Record<string, unknown>).code = -32601;
    throw err;
  }

  const txArray = Array.isArray(result) ? result : (result.data ?? []);
  if (!Array.isArray(txArray)) {
    const err = new Error("Method not found");
    (err as unknown as Record<string, unknown>).code = -32601;
    throw err;
  }

  const paginationToken = result.paginationToken ?? undefined;
  const transactions = txArray.map(mapHeliusTx);

  // Decode instructions
  await decodeTransactionInstructions(transactions, rpcUrl);

  return {
    transactions,
    hasMore: !!paginationToken || transactions.length === limit,
    oldestSignature: paginationToken ?? (transactions.length > 0 ? transactions[transactions.length - 1].signature : undefined),
  };
}

function mapHeliusTx(raw: unknown): ParsedTransaction {
  const tx = raw as Record<string, unknown>;
  const meta = (tx.meta || {}) as Record<string, unknown>;
  const transaction = (tx.transaction || {}) as Record<string, unknown>;
  const message = (transaction.message || {}) as Record<string, unknown>;

  const accountKeys = ((message.accountKeys as string[]) || []).map(String);

  // For v0 transactions, append loaded addresses
  const loadedAddresses = (meta.loadedAddresses || {}) as Record<string, string[]>;
  const writableLoaded = (loadedAddresses.writable || []).map(String);
  const readonlyLoaded = (loadedAddresses.readonly || []).map(String);
  const allKeys = [...accountKeys, ...writableLoaded, ...readonlyLoaded];

  const rawIxs = (message.instructions || []) as Record<string, unknown>[];
  const instructions: ParsedInstruction[] = rawIxs.map((ix) => mapInstruction(ix, allKeys));

  const innerIxSets = (meta.innerInstructions || []) as Record<string, unknown>[];
  const innerInstructions: InnerInstructionSet[] = innerIxSets.map((set) => ({
    index: (set.index as number) || 0,
    instructions: ((set.instructions || []) as Record<string, unknown>[]).map((ix) =>
      mapInstruction(ix, allKeys),
    ),
  }));

  // Signature can be in tx.signature or in transaction.signatures[0]
  const signatures = (transaction.signatures || []) as string[];
  const sig = (tx.signature as string) || signatures[0] || "";

  return {
    signature: sig,
    slot: Number(tx.slot ?? 0),
    blockTime: tx.blockTime != null ? Number(tx.blockTime) : null,
    err: meta.err ?? null,
    fee: Number(meta.fee ?? 0),
    accountKeys: allKeys,
    instructions,
    innerInstructions,
    logMessages: (meta.logMessages as string[]) || [],
    preBalances: ((meta.preBalances || []) as (number | bigint)[]).map(Number),
    postBalances: ((meta.postBalances || []) as (number | bigint)[]).map(Number),
    preTokenBalances: (meta.preTokenBalances as TokenBalance[]) || [],
    postTokenBalances: (meta.postTokenBalances as TokenBalance[]) || [],
  };
}

// --- Standard RPC fallback: getSignaturesForAddress + parallel getTransaction ---

async function fetchViaStandardRpc(
  addr: string,
  rpcUrl: string,
  limit: number,
  before?: string,
): Promise<TransactionPage> {
  const rpc = getRpc(rpcUrl);

  const sigOpts: Record<string, unknown> = { limit };
  if (before) {
    try {
      sigOpts.before = signature(before);
    } catch {
      // Invalid signature format (e.g. Helius pagination token) — skip before param
    }
  }

  const sigs = await rpc
    .getSignaturesForAddress(address(addr), sigOpts as Parameters<typeof rpc.getSignaturesForAddress>[1])
    .send();

  if (!sigs || sigs.length === 0) {
    return { transactions: [], hasMore: false };
  }

  // Fetch all transactions in parallel
  const results = await Promise.allSettled(
    sigs.map((sigInfo) =>
      rpc
        .getTransaction(signature(String(sigInfo.signature)), {
          maxSupportedTransactionVersion: 0,
        })
        .send()
        .then((tx) => tx ? mapStandardTx(sigInfo.signature as string, tx) : null),
    ),
  );

  const transactions: ParsedTransaction[] = [];
  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      transactions.push(result.value);
    }
  }

  return {
    transactions,
    hasMore: sigs.length === limit,
    oldestSignature: transactions.length > 0 ? transactions[transactions.length - 1].signature : undefined,
  };
}

function mapStandardTx(sig: string, tx: Record<string, unknown>): ParsedTransaction {
  const meta = (tx.meta || {}) as Record<string, unknown>;
  const transaction = (tx.transaction || {}) as Record<string, unknown>;
  const message = (transaction.message || {}) as Record<string, unknown>;

  // Build full account keys list
  const staticKeys = ((message.accountKeys || message.staticAccountKeys || []) as string[]).map(String);

  // For v0 transactions, append loaded addresses
  const loadedAddresses = (meta.loadedAddresses || {}) as Record<string, string[]>;
  const writableLoaded = (loadedAddresses.writable || []).map(String);
  const readonlyLoaded = (loadedAddresses.readonly || []).map(String);
  const accountKeys = [...staticKeys, ...writableLoaded, ...readonlyLoaded];

  const rawIxs = (message.instructions || []) as Record<string, unknown>[];
  const instructions: ParsedInstruction[] = rawIxs.map((ix) => mapInstruction(ix, accountKeys));

  const innerIxSets = (meta.innerInstructions || []) as Record<string, unknown>[];
  const innerInstructions: InnerInstructionSet[] = innerIxSets.map((set) => ({
    index: (set.index as number) || 0,
    instructions: ((set.instructions || []) as Record<string, unknown>[]).map((ix) =>
      mapInstruction(ix, accountKeys),
    ),
  }));

  return {
    signature: sig,
    slot: Number(tx.slot ?? 0),
    blockTime: tx.blockTime != null ? Number(tx.blockTime) : null,
    err: meta.err ?? null,
    fee: Number(meta.fee ?? 0),
    accountKeys,
    instructions,
    innerInstructions,
    logMessages: (meta.logMessages as string[]) || [],
    preBalances: ((meta.preBalances || []) as (number | bigint)[]).map(Number),
    postBalances: ((meta.postBalances || []) as (number | bigint)[]).map(Number),
    preTokenBalances: (meta.preTokenBalances as TokenBalance[]) || [],
    postTokenBalances: (meta.postTokenBalances as TokenBalance[]) || [],
  };
}

function mapInstruction(
  ix: Record<string, unknown>,
  accountKeys: string[],
): ParsedInstruction {
  const programIdIndex = ix.programIdIndex as number | undefined;
  const programId = programIdIndex !== undefined ? accountKeys[programIdIndex] || "" : (ix.programId as string) || "";

  const accountIndices = (ix.accounts || []) as number[];
  const accounts = accountIndices.map((idx) =>
    typeof idx === "number" ? accountKeys[idx] || String(idx) : String(idx),
  );

  return {
    programId,
    accounts,
    data: (ix.data as string) || "",
  };
}
