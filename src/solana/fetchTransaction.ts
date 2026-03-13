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
      encoding: "jsonParsed",
      maxSupportedTransactionVersion: 0,
    })
    .send();

  if (!result) return null;

  const { transaction, meta, slot, blockTime } = result;

  // Build account keys list from the message
  const accountKeys: string[] = (
    transaction.message.accountKeys as unknown as ({ pubkey?: string; toBase58?: () => string } | string)[]
  ).map((k) => {
    if (typeof k === "string") return k;
    if (typeof k === "object" && k !== null) {
      if ("pubkey" in k && k.pubkey) return String(k.pubkey);
      if ("toBase58" in k && typeof k.toBase58 === "function") return k.toBase58();
    }
    return String(k);
  });

  // For v0 transactions, append loaded addresses
  if ((meta as Record<string, unknown>)?.loadedAddresses) {
    const loaded = (meta as Record<string, unknown>).loadedAddresses as {
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

  // Map instructions — handles both jsonParsed format (programId + string accounts)
  // and json format (programIdIndex + numeric account indices)
  const instructions = (
    transaction.message.instructions as unknown as Record<string, unknown>[]
  ).map((ix) => mapRpcInstruction(ix, accountKeys));

  // Map inner instructions
  const innerInstructions = (
    (meta?.innerInstructions as unknown as { index: number | bigint; instructions: Record<string, unknown>[] }[]) ?? []
  ).map((inner) => ({
    index: Number(inner.index),
    instructions: inner.instructions.map((ix) => mapRpcInstruction(ix, accountKeys)),
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
    preBalances: ((meta?.preBalances as unknown as (number | bigint)[]) ?? []).map((v) => Number(v)),
    postBalances: ((meta?.postBalances as unknown as (number | bigint)[]) ?? []).map((v) => Number(v)),
    preTokenBalances: ((meta?.preTokenBalances ?? []) as unknown as Record<string, unknown>[]).map(coerceTokenBalance),
    postTokenBalances: ((meta?.postTokenBalances ?? []) as unknown as Record<string, unknown>[]).map(coerceTokenBalance),
  };
}

/**
 * Map a single RPC instruction to our ParsedInstruction type.
 * Handles both jsonParsed format (programId + string accounts) and
 * json format (programIdIndex + numeric account indices).
 */
function mapRpcInstruction(
  ix: Record<string, unknown>,
  accountKeys: string[],
): { programId: string; accounts: string[]; data: string } {
  // jsonParsed format: programId is a direct string, accounts are address strings
  // json format: programIdIndex is a number, accounts are numeric indices
  const programIdIndex = ix.programIdIndex as number | bigint | undefined;
  const programId = programIdIndex != null
    ? accountKeys[Number(programIdIndex)] ?? String(programIdIndex)
    : (ix.programId as string) ?? "";

  const rawAccounts = (ix.accounts ?? []) as (number | bigint | string)[];
  const accounts = rawAccounts.map((acc) =>
    typeof acc === "string" ? acc : accountKeys[Number(acc)] ?? String(acc),
  );

  return {
    programId,
    accounts,
    data: (ix.data as string) ?? "",
  };
}
