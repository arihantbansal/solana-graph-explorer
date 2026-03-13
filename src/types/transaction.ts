/**
 * Types for transaction history and transaction detail view.
 */

export interface TokenBalance {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount: {
    amount: string;
    decimals: number;
    uiAmount: number | null;
    uiAmountString: string;
  };
}

export interface ParsedInstruction {
  programId: string;
  accounts: string[];
  data: string; // base58
  decoded?: {
    instructionName: string;
    args: Record<string, unknown>;
    programName?: string;
  };
}

export interface InnerInstructionSet {
  index: number;
  instructions: ParsedInstruction[];
}

export interface ParsedTransaction {
  signature: string;
  slot: number;
  blockTime: number | null;
  err: unknown | null;
  fee: number;
  accountKeys: string[];
  instructions: ParsedInstruction[];
  innerInstructions: InnerInstructionSet[];
  logMessages: string[];
  preBalances: number[];
  postBalances: number[];
  preTokenBalances: TokenBalance[];
  postTokenBalances: TokenBalance[];
}

export interface TransactionFilter {
  timeRange: "1h" | "24h" | "7d" | "30d" | "all";
  statusFilter: "all" | "success" | "failed";
  instructionFilter?: string;
}

export interface TransactionPage {
  transactions: ParsedTransaction[];
  hasMore: boolean;
  oldestSignature?: string;
}

/** Balance change computed from pre/post balances (bigint to avoid overflow) */
export interface BalanceChange {
  address: string;
  preBalance: bigint;
  postBalance: bigint;
  delta: bigint;
}

/** Token balance change computed from pre/post token balances */
export interface TokenBalanceChange {
  address: string;
  mint: string;
  preAmount: number;
  postAmount: number;
  delta: number;
  decimals: number;
}

/** Full decoded transaction data for the transaction detail view */
export interface TransactionViewData {
  transaction: ParsedTransaction;
  balanceChanges: BalanceChange[];
  tokenBalanceChanges: TokenBalanceChange[];
}
