import { cn } from "@/lib/utils";

interface TransactionLogsProps {
  logs: string[];
}

function getLogLineClass(line: string): string {
  if (/Program .+ invoke/.test(line)) return "text-blue-500";
  if (/Program .+ success/.test(line)) return "text-green-500";
  if (/Program .+ failed/.test(line) || /Error/.test(line)) return "text-red-500";
  return "text-foreground";
}

export function TransactionLogs({ logs }: TransactionLogsProps) {
  if (logs.length === 0) {
    return (
      <div className="px-3 py-2 text-xs text-muted-foreground">
        No log messages available.
      </div>
    );
  }

  return (
    <div className="px-3 pb-3">
      <h3 className="text-xs font-medium text-muted-foreground mb-1.5">
        Transaction Logs
      </h3>
      <div className="max-h-60 overflow-y-auto bg-muted/50 border rounded-md p-2">
        <pre className="font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all">
          {logs.map((line, i) => (
            <div key={i} className={cn(getLogLineClass(line))}>
              {line}
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}
