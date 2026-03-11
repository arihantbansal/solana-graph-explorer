import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { AccountNode as AccountNodeType } from "@/types/graph";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ChevronDown, ChevronRight } from "lucide-react";

/** Hash a string to a hue value (0-360) for color-coded borders. */
function hashToHue(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

function shortenAddress(address: string): string {
  if (address.length <= 8) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function lamportsToSol(lamports: number): string {
  return (lamports / 1_000_000_000).toFixed(4);
}

export function AccountNodeComponent({ data }: NodeProps<AccountNodeType>) {
  const {
    address,
    accountType,
    programName,
    balance,
    isExpanded,
    isLoading,
    programId,
  } = data;

  const hue = programId ? hashToHue(programId) : 200;
  const borderColor = `hsl(${hue}, 70%, 50%)`;

  return (
    <Card
      className="min-w-[160px] max-w-[220px] cursor-pointer shadow-md"
      style={{ borderLeft: `4px solid ${borderColor}` }}
    >
      <Handle type="target" position={Position.Left} className="!bg-muted-foreground" />
      <CardContent className="p-3 space-y-1.5">
        <div className="flex items-center justify-between gap-1">
          <span className="font-mono text-xs font-medium truncate">
            {shortenAddress(address)}
          </span>
          {isLoading ? (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground shrink-0" />
          ) : (
            <span className="text-muted-foreground shrink-0">
              {isExpanded ? (
                <ChevronDown className="size-3.5" />
              ) : (
                <ChevronRight className="size-3.5" />
              )}
            </span>
          )}
        </div>

        {accountType && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {accountType}
          </Badge>
        )}

        {programName && (
          <div className="text-[10px] text-muted-foreground truncate">
            {programName}
          </div>
        )}

        {balance !== undefined && (
          <div className="text-[11px] font-mono text-muted-foreground">
            {lamportsToSol(balance)} SOL
          </div>
        )}
      </CardContent>
      <Handle type="source" position={Position.Right} className="!bg-muted-foreground" />
    </Card>
  );
}
