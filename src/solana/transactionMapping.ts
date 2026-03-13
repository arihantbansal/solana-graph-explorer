import type { ParsedInstruction, ParsedTransaction, InnerInstructionSet, TokenBalance } from "@/types/transaction";

/**
 * Map a single RPC instruction (jsonParsed or json format) to our ParsedInstruction type.
 *
 * Handles both:
 *   - jsonParsed format: `programId` is a string, `accounts` are address strings
 *   - json format: `programIdIndex` is a number/bigint, `accounts` are numeric indices
 */
export function mapRpcInstruction(
  ix: Record<string, unknown>,
  accountKeys: string[],
): ParsedInstruction {
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

/**
 * Append v0 loaded addresses (writable + readonly) to an account keys list.
 * Returns a new array with loaded addresses appended.
 */
export function appendLoadedAddresses(
  accountKeys: string[],
  meta: Record<string, unknown>,
): string[] {
  const loaded = meta.loadedAddresses as { writable?: string[]; readonly?: string[] } | undefined;
  if (!loaded) return accountKeys;

  const result = [...accountKeys];
  if (loaded.writable) {
    for (const addr of loaded.writable) result.push(String(addr));
  }
  if (loaded.readonly) {
    for (const addr of loaded.readonly) result.push(String(addr));
  }
  return result;
}

/**
 * Map raw RPC instruction and inner instruction arrays to typed arrays.
 */
export function mapInstructionArrays(
  message: Record<string, unknown>,
  meta: Record<string, unknown>,
  accountKeys: string[],
): { instructions: ParsedInstruction[]; innerInstructions: InnerInstructionSet[] } {
  const rawIxs = (message.instructions ?? []) as Record<string, unknown>[];
  const instructions = rawIxs.map((ix) => mapRpcInstruction(ix, accountKeys));

  const innerIxSets = (meta.innerInstructions ?? []) as { index: number | bigint; instructions: Record<string, unknown>[] }[];
  const innerInstructions: InnerInstructionSet[] = innerIxSets.map((set) => ({
    index: Number(set.index ?? 0),
    instructions: (set.instructions ?? []).map((ix) => mapRpcInstruction(ix, accountKeys)),
  }));

  return { instructions, innerInstructions };
}

/** Coerce RPC token balance fields to safe JS types (bigint -> number where needed). */
export function coerceTokenBalance(raw: Record<string, unknown>): TokenBalance {
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
 * Build a ParsedTransaction from raw RPC response components.
 * Shared by both single-tx fetch and batch-tx fetch paths.
 */
export function buildParsedTransaction(opts: {
  signature: string;
  slot: number | bigint;
  blockTime: number | bigint | null | undefined;
  meta: Record<string, unknown>;
  message: Record<string, unknown>;
  accountKeys: string[];
}): ParsedTransaction {
  const { signature, meta, message, accountKeys } = opts;
  const { instructions, innerInstructions } = mapInstructionArrays(message, meta, accountKeys);

  return {
    signature,
    slot: Number(opts.slot ?? 0),
    blockTime: opts.blockTime != null ? Number(opts.blockTime) : null,
    err: meta.err ?? null,
    fee: Number(meta.fee ?? 0),
    accountKeys,
    instructions,
    innerInstructions,
    logMessages: (meta.logMessages as string[]) ?? [],
    preBalances: ((meta.preBalances ?? []) as (number | bigint)[]).map(Number),
    postBalances: ((meta.postBalances ?? []) as (number | bigint)[]).map(Number),
    preTokenBalances: ((meta.preTokenBalances ?? []) as Record<string, unknown>[]).map(coerceTokenBalance),
    postTokenBalances: ((meta.postTokenBalances ?? []) as Record<string, unknown>[]).map(coerceTokenBalance),
  };
}
