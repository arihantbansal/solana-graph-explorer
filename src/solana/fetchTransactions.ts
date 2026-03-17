import type { ParsedTransaction, TransactionPage } from "@/types/transaction";
import type { Idl } from "@/types/idl";
import { getRpc } from "./rpc";
import { getIdl, setIdl } from "./idlCache";
import { fetchIdl } from "./fetchIdl";
import { decodeInstruction } from "@/engine/instructionDecoder";
import { address, signature } from "@solana/kit";
import {
  appendLoadedAddresses,
  buildParsedTransaction,
} from "./transactionMapping";

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
  options?: {
    before?: string;
    limit?: number;
    sortOrder?: "asc" | "desc";
    /** Helius-only: include associated token account transactions */
    tokenAccounts?: "none" | "balanceChanged" | "all";
  },
): Promise<TransactionPage> {
  const limit = options?.limit ?? 20;
  const sortOrder = options?.sortOrder ?? "desc";

  // Reset detection if URL changed
  if (rpcUrl !== detectedForUrl) {
    heliusDetected = null;
    detectedForUrl = rpcUrl;
  }

  // If we haven't detected yet, try Helius first
  if (heliusDetected === null) {
    try {
      const result = await fetchViaHelius(addr, rpcUrl, limit, options?.before, sortOrder, options?.tokenAccounts);
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
    return fetchViaHelius(addr, rpcUrl, limit, options?.before, sortOrder, options?.tokenAccounts);
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
  const programIds = new Set(
    transactions.flatMap((tx) => tx.instructions.map((ix) => ix.programId)),
  );

  // Fetch any missing IDLs in parallel
  const idlMap = new Map<string, Idl>();
  await Promise.all(
    [...programIds].map(async (pid) => {
      let idl = getIdl(pid);
      if (!idl) {
        try {
          const fetched = await fetchIdl(pid, rpcUrl);
          if (fetched) {
            idl = fetched;
            setIdl(pid, idl);
          }
        } catch (err) {
          console.warn(`Failed to fetch IDL for program ${pid}`, err);
        }
      }
      if (idl) idlMap.set(pid, idl);
    }),
  );

  // Decode each undecoded instruction that has an available IDL (mutates in place per function contract)
  for (const ix of transactions.flatMap((tx) => tx.instructions).filter((ix) => !ix.decoded && idlMap.has(ix.programId))) {
    const decoded = decodeInstruction(ix, idlMap.get(ix.programId)!);
    if (decoded) ix.decoded = decoded;
  }
}

// --- Helius path: single call returns full transaction data ---

async function fetchViaHelius(
  addr: string,
  rpcUrl: string,
  limit: number,
  before?: string,
  sortOrder: "asc" | "desc" = "desc",
  tokenAccounts?: "none" | "balanceChanged" | "all",
): Promise<TransactionPage> {
  const options: Record<string, unknown> = {
    transactionDetails: "full",
    limit,
    sortOrder,
  };
  if (before) options.paginationToken = before;
  if (tokenAccounts && tokenAccounts !== "none") {
    options.filters = { tokenAccounts };
  }

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

  const staticKeys = ((message.accountKeys as string[]) || []).map(String);
  const accountKeys = appendLoadedAddresses(staticKeys, meta);

  // Signature can be in tx.signature or in transaction.signatures[0]
  const signatures = (transaction.signatures || []) as string[];
  const sig = (tx.signature as string) || signatures[0] || "";

  return buildParsedTransaction({
    signature: sig,
    slot: tx.slot as number | bigint ?? 0,
    blockTime: tx.blockTime as number | bigint | null | undefined,
    meta,
    message,
    accountKeys,
  });
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
    } catch (err) {
      console.warn("Invalid signature format for 'before' param, skipping", err);
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
    sigs.map(async (sigInfo) => {
      const tx = await rpc
        .getTransaction(signature(String(sigInfo.signature)), {
          encoding: "jsonParsed",
          maxSupportedTransactionVersion: 0,
        })
        .send();
      return tx ? mapStandardTx(sigInfo.signature as string, tx) : null;
    }),
  );

  const transactions = results
    .filter((r): r is PromiseFulfilledResult<ParsedTransaction | null> => r.status === "fulfilled" && !!r.value)
    .map((r) => r.value!);

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

  // Build full account keys list (handle staticAccountKeys fallback for some RPC responses)
  const staticKeys = ((message.accountKeys || message.staticAccountKeys || []) as string[]).map(String);
  const accountKeys = appendLoadedAddresses(staticKeys, meta);

  return buildParsedTransaction({
    signature: sig,
    slot: tx.slot as number | bigint ?? 0,
    blockTime: tx.blockTime as number | bigint | null | undefined,
    meta,
    message,
    accountKeys,
  });
}
