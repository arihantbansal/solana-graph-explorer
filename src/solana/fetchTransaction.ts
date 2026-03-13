import { getRpc } from "./rpc";
import { signature as toSignature } from "@solana/kit";
import type { ParsedTransaction, TokenBalance } from "@/types/transaction";

/** Coerce RPC token balance fields to safe JS types (bigint → number where needed). */
function coerceTokenBalance(raw: Record<string, unknown>): TokenBalance {
  const uiAmt = raw.uiTokenAmount as Record<string, unknown> | undefined;
  return {
    accountIndex: Number(raw.accountIndex ?? 0),
    mint: String(raw.mint ?? ""),
    owner: raw.owner != null ? String(raw.owner) : undefined,
    uiTokenAmount: {
      amount: String(uiAmt?.amount ?? "0"),
      decimals: Number(uiAmt?.decimals ?? 0),
      uiAmount: uiAmt?.uiAmount != null ? Number(uiAmt.uiAmount) : null,
      uiAmountString: String(uiAmt?.uiAmountString ?? "0"),
    },
  };
}

/**
 * Fetch a single transaction by signature and map it to our ParsedTransaction type.
 */
export async function fetchTransactionBySignature(
  sig: string,
  rpcUrl: string,
): Promise<ParsedTransaction | null> {
  const rpc = getRpc(rpcUrl);

  const result = await rpc
    .getTransaction(toSignature(sig), {
      maxSupportedTransactionVersion: 0,
    })
    .send();

  if (!result) return null;

  const { transaction, meta, slot, blockTime } = result;

  // Build account keys list from the message
  const accountKeys: string[] = (
    transaction.message.accountKeys as { pubkey?: string; toBase58?: () => string }[] | string[]
  ).map((k) => {
    if (typeof k === "string") return k;
    if (typeof k === "object" && k !== null) {
      if ("pubkey" in k && k.pubkey) return String(k.pubkey);
      if ("toBase58" in k && typeof k.toBase58 === "function") return k.toBase58();
    }
    return String(k);
  });

  // For v0 transactions, append loaded addresses
  if (meta?.loadedAddresses) {
    const loaded = meta.loadedAddresses as {
      writable?: string[];
      readonly?: string[];
    };
    if (loaded.writable) {
      for (const addr of loaded.writable) {
        accountKeys.push(String(addr));
      }
    }
    if (loaded.readonly) {
      for (const addr of loaded.readonly) {
        accountKeys.push(String(addr));
      }
    }
  }

  // Map instructions
  const instructions = (
    transaction.message.instructions as {
      programIdIndex: number | bigint;
      accounts: (number | bigint)[];
      data: string;
    }[]
  ).map((ix) => ({
    programId: accountKeys[Number(ix.programIdIndex)] ?? String(ix.programIdIndex),
    accounts: (ix.accounts ?? []).map((idx) => accountKeys[Number(idx)] ?? String(idx)),
    data: ix.data ?? "",
  }));

  // Map inner instructions
  const innerInstructions = (
    (meta?.innerInstructions as { index: number | bigint; instructions: { programIdIndex: number | bigint; accounts: (number | bigint)[]; data: string }[] }[]) ?? []
  ).map((inner) => ({
    index: Number(inner.index),
    instructions: inner.instructions.map((ix) => ({
      programId: accountKeys[Number(ix.programIdIndex)] ?? String(ix.programIdIndex),
      accounts: (ix.accounts ?? []).map((idx) => accountKeys[Number(idx)] ?? String(idx)),
      data: ix.data ?? "",
    })),
  }));

  return {
    signature: sig,
    slot: Number(slot),
    blockTime: blockTime != null ? Number(blockTime) : null,
    err: meta?.err ?? null,
    fee: Number(meta?.fee ?? 0),
    accountKeys,
    instructions,
    innerInstructions,
    logMessages: (meta?.logMessages as string[]) ?? [],
    preBalances: ((meta?.preBalances as (number | bigint)[]) ?? []).map((v) => Number(v)),
    postBalances: ((meta?.postBalances as (number | bigint)[]) ?? []).map((v) => Number(v)),
    preTokenBalances: ((meta?.preTokenBalances ?? []) as Record<string, unknown>[]).map(coerceTokenBalance),
    postTokenBalances: ((meta?.postTokenBalances ?? []) as Record<string, unknown>[]).map(coerceTokenBalance),
  };
}
