import { Badge } from "@/components/ui/badge";
import { formatRelativeTime, formatAbsoluteTime } from "@/utils/format";
import type { ParsedTransaction } from "@/types/transaction";

interface TransactionRowProps {
  transaction: ParsedTransaction;
  onClick: (signature: string) => void;
  showAbsoluteTime?: boolean;
}

export function TransactionRow({ transaction, onClick, showAbsoluteTime }: TransactionRowProps) {
  const sig = transaction.signature;
  const shortSig = `${sig.slice(0, 8)}...${sig.slice(-4)}`;
  const isSuccess = transaction.err === null;

  // Collect decoded instruction names
  const ixNames: string[] = [];
  for (const ix of transaction.instructions) {
    if (ix.decoded?.instructionName && !ixNames.includes(ix.decoded.instructionName)) {
      ixNames.push(ix.decoded.instructionName);
    }
  }

  return (
    <button
      className="w-full text-left px-3 py-2 hover:bg-muted/50 rounded-md transition-colors border border-transparent hover:border-border"
      onClick={() => onClick(sig)}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs text-muted-foreground">{shortSig}</span>
        <div className="flex items-center gap-2">
          {transaction.blockTime && (
            <span className="text-[10px] text-muted-foreground">
              {showAbsoluteTime
                ? formatAbsoluteTime(transaction.blockTime)
                : formatRelativeTime(transaction.blockTime)}
            </span>
          )}
          <Badge
            variant={isSuccess ? "secondary" : "destructive"}
            className="text-[9px] px-1.5 py-0"
          >
            {isSuccess ? "Success" : "Failed"}
          </Badge>
        </div>
      </div>
      {ixNames.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {ixNames.map((name) => (
            <Badge key={name} variant="outline" className="text-[9px] px-1.5 py-0">
              {name}
            </Badge>
          ))}
        </div>
      )}
    </button>
  );
}
