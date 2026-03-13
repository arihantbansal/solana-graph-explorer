import { getRpc } from "./rpc";
import { signature as toSignature } from "@solana/kit";
import type { ParsedTransaction } from "@/types/transaction";
import { appendLoadedAddresses, buildParsedTransaction } from "./transactionMapping";

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
  const message = transaction.message as unknown as Record<string, unknown>;
  const metaRecord = meta as unknown as Record<string, unknown>;

  // Build account keys list from the message
  const staticKeys: string[] = (
    message.accountKeys as unknown as ({ pubkey?: string; toBase58?: () => string } | string)[]
  ).map((k) => {
    if (typeof k === "string") return k;
    if (typeof k === "object" && k !== null) {
      if ("pubkey" in k && k.pubkey) return String(k.pubkey);
      if ("toBase58" in k && typeof k.toBase58 === "function") return k.toBase58();
    }
    return String(k);
  });

  // For v0 transactions, append loaded addresses
  const accountKeys = appendLoadedAddresses(staticKeys, metaRecord);

  return buildParsedTransaction({
    signature: sig,
    slot: slot as number | bigint,
    blockTime: blockTime as number | bigint | null | undefined,
    meta: metaRecord,
    message: message,
    accountKeys,
  });
}
