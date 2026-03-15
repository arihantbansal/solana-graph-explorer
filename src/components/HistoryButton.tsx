import { History, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CopyButton } from "@/components/CopyButton";
import { useHistory } from "@/contexts/HistoryContext";
import { shortenAddress, formatRelativeTime } from "@/utils/format";

interface HistoryButtonProps {
  onAccountClick: (address: string) => void;
  onTransactionClick: (signature: string) => void;
}

export function HistoryButton({ onAccountClick, onTransactionClick }: HistoryButtonProps) {
  const { history, clearHistory } = useHistory();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7" title="History">
          <History className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="border-b px-3 py-2">
          <span className="text-sm font-medium">History</span>
        </div>
        {history.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            No history yet
          </div>
        ) : (
          <>
            <div className="max-h-80 overflow-y-auto">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() =>
                    item.type === "account"
                      ? onAccountClick(item.id)
                      : onTransactionClick(item.id)
                  }
                >
                  <span
                    className={`mt-0.5 shrink-0 rounded px-1 py-0.5 text-[10px] font-medium leading-none ${
                      item.type === "account"
                        ? "bg-blue-500/15 text-blue-400"
                        : "bg-purple-500/15 text-purple-400"
                    }`}
                  >
                    {item.type === "account" ? "acct" : "tx"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className="truncate text-xs font-mono">
                        {item.label ?? shortenAddress(item.id)}
                      </span>
                      <CopyButton value={item.id} className="opacity-0 group-hover:opacity-100" iconSize="size-2.5" />
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      {item.type === "account" && item.accountType && (
                        <span className="rounded bg-muted px-1">{item.accountType}</span>
                      )}
                      {item.type === "account" && item.programName && (
                        <span className="truncate">{item.programName}</span>
                      )}
                      {item.type === "transaction" && item.instructionNames && item.instructionNames.length > 0 && (
                        <span className="truncate">
                          {item.instructionNames.join(", ")}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {formatRelativeTime(Math.floor(item.timestamp / 1000))}
                  </span>
                </div>
              ))}
            </div>
            <div className="border-t px-3 py-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-full text-xs text-muted-foreground"
                onClick={clearHistory}
              >
                <Trash2 className="mr-1 size-3" />
                Clear History
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
