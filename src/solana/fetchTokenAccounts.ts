import { address } from "@solana/kit";
import { getRpc } from "./rpc";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "./builtinIdls";

export interface TokenAccountInfo {
  address: string; // the token account (ATA) address
  mint: string;
  owner: string;
  amount: bigint; // raw amount
  decimals: number;
  uiAmount: number; // human-readable
}

interface ParsedTokenAccountData {
  parsed: {
    info: {
      mint: string;
      owner: string;
      tokenAmount: {
        amount: string;
        decimals: number;
        uiAmount: number | null;
        uiAmountString: string;
      };
    };
    type: string;
  };
  program: string;
  space: number;
}

function parseTokenAccounts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  response: any,
): TokenAccountInfo[] {
  const value = response?.value;
  if (!Array.isArray(value)) return [];

  return value.flatMap((item): TokenAccountInfo[] => {
    try {
      const data = item.account?.data as ParsedTokenAccountData;
      const info = data?.parsed?.info;
      if (!info) return [];

      return [{
        address: typeof item.pubkey === "string" ? item.pubkey : String(item.pubkey),
        mint: info.mint,
        owner: info.owner,
        amount: BigInt(info.tokenAmount.amount),
        decimals: info.tokenAmount.decimals,
        uiAmount: info.tokenAmount.uiAmount ?? 0,
      }];
    } catch (err) {
      console.warn("Failed to parse token account, skipping malformed entry", err);
      return [];
    }
  });
}

export async function fetchTokenAccounts(
  ownerAddress: string,
  rpcUrl: string,
): Promise<TokenAccountInfo[]> {
  const rpc = getRpc(rpcUrl);
  const owner = address(ownerAddress);

  const results: TokenAccountInfo[] = [];
  const errors: Error[] = [];

  // Fetch from both token programs in parallel
  const [splResult, token2022Result] = await Promise.allSettled([
    rpc
      .getTokenAccountsByOwner(
        owner,
        { programId: address(TOKEN_PROGRAM_ID) },
        { encoding: "jsonParsed" },
      )
      .send(),
    rpc
      .getTokenAccountsByOwner(
        owner,
        { programId: address(TOKEN_2022_PROGRAM_ID) },
        { encoding: "jsonParsed" },
      )
      .send(),
  ]);

  if (splResult.status === "fulfilled") {
    results.push(...parseTokenAccounts(splResult.value));
  } else {
    errors.push(splResult.reason);
  }

  if (token2022Result.status === "fulfilled") {
    results.push(...parseTokenAccounts(token2022Result.value));
  } else {
    errors.push(token2022Result.reason);
  }

  // If both failed, throw
  if (results.length === 0 && errors.length === 2) {
    throw new Error(`Failed to fetch token accounts: ${errors[0]?.message}`);
  }

  // Sort by uiAmount descending
  results.sort((a, b) => b.uiAmount - a.uiAmount);

  return results;
}
