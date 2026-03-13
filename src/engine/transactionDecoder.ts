import type {
  ParsedTransaction,
  TransactionViewData,
  BalanceChange,
  TokenBalanceChange,
} from "@/types/transaction";
import type { Idl } from "@/types/idl";
import { getIdl } from "@/solana/idlCache";
import { fetchIdl } from "@/solana/fetchIdl";
import { setIdl } from "@/solana/idlCache";
import { decodeInstruction } from "@/engine/instructionDecoder";

/**
 * Compute SOL balance changes from pre/post balances and account keys.
 */
export function computeBalanceChanges(tx: ParsedTransaction): BalanceChange[] {
  const changes: BalanceChange[] = [];
  for (let i = 0; i < tx.accountKeys.length; i++) {
    const pre = BigInt(tx.preBalances[i] ?? 0);
    const post = BigInt(tx.postBalances[i] ?? 0);
    const delta = post - pre;
    if (delta !== 0n) {
      changes.push({
        address: tx.accountKeys[i],
        preBalance: pre,
        postBalance: post,
        delta,
      });
    }
  }
  return changes;
}

/**
 * Compute token balance changes from pre/post token balances.
 */
export function computeTokenBalanceChanges(
  tx: ParsedTransaction,
): TokenBalanceChange[] {
  const changes: TokenBalanceChange[] = [];

  // Build a map of post balances by accountIndex + mint
  const postMap = new Map<string, typeof tx.postTokenBalances[number]>();
  for (const tb of tx.postTokenBalances) {
    postMap.set(`${tb.accountIndex}:${tb.mint}`, tb);
  }

  // Track which post entries we've matched
  const matchedPost = new Set<string>();

  for (const pre of tx.preTokenBalances) {
    const key = `${pre.accountIndex}:${pre.mint}`;
    const post = postMap.get(key);
    matchedPost.add(key);

    const preAmount = pre.uiTokenAmount.uiAmount ?? 0;
    const postAmount = post?.uiTokenAmount.uiAmount ?? 0;
    const delta = postAmount - preAmount;

    if (delta !== 0) {
      changes.push({
        address: tx.accountKeys[pre.accountIndex] ?? String(pre.accountIndex),
        mint: pre.mint,
        preAmount,
        postAmount,
        delta,
        decimals: pre.uiTokenAmount.decimals,
      });
    }
  }

  // Check for post-only entries (new token accounts)
  for (const post of tx.postTokenBalances) {
    const key = `${post.accountIndex}:${post.mint}`;
    if (matchedPost.has(key)) continue;

    const postAmount = post.uiTokenAmount.uiAmount ?? 0;
    if (postAmount !== 0) {
      changes.push({
        address:
          tx.accountKeys[post.accountIndex] ?? String(post.accountIndex),
        mint: post.mint,
        preAmount: 0,
        postAmount,
        delta: postAmount,
        decimals: post.uiTokenAmount.decimals,
      });
    }
  }

  return changes;
}

/**
 * Decode a full transaction: fetch IDLs for each program, decode instructions,
 * compute balance changes.
 */
export async function decodeTransaction(
  tx: ParsedTransaction,
  rpcUrl: string,
): Promise<TransactionViewData> {
  // Collect unique program IDs
  const programIds = new Set<string>();
  for (const ix of tx.instructions) {
    programIds.add(ix.programId);
  }
  for (const inner of tx.innerInstructions) {
    for (const ix of inner.instructions) {
      programIds.add(ix.programId);
    }
  }

  // Fetch IDLs for each unique program
  const idls = new Map<string, Idl>();
  await Promise.all(
    Array.from(programIds).map(async (pid) => {
      // Check cache first
      const cached = getIdl(pid);
      if (cached) {
        idls.set(pid, cached);
        return;
      }
      try {
        const idl = await fetchIdl(pid, rpcUrl);
        if (idl) {
          setIdl(pid, idl);
          idls.set(pid, idl);
        }
      } catch {
        // IDL fetch failed — skip
      }
    }),
  );

  // Decode each instruction
  const decodedInstructions = tx.instructions.map((ix) => {
    const idl = idls.get(ix.programId);
    if (!idl) return ix;
    const decoded = decodeInstruction(ix, idl);
    if (!decoded) return ix;
    return { ...ix, decoded };
  });

  // Decode inner instructions
  const decodedInner = tx.innerInstructions.map((inner) => ({
    ...inner,
    instructions: inner.instructions.map((ix) => {
      const idl = idls.get(ix.programId);
      if (!idl) return ix;
      const decoded = decodeInstruction(ix, idl);
      if (!decoded) return ix;
      return { ...ix, decoded };
    }),
  }));

  const decodedTx: ParsedTransaction = {
    ...tx,
    instructions: decodedInstructions,
    innerInstructions: decodedInner,
  };

  return {
    transaction: decodedTx,
    balanceChanges: computeBalanceChanges(tx),
    tokenBalanceChanges: computeTokenBalanceChanges(tx),
  };
}
