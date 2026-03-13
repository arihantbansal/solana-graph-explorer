import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { Search } from "lucide-react";

function InstructionClusterNode({ data }: NodeProps) {
  const label = data.label as string;

  return (
    <div
      className="relative rounded-lg border border-border bg-muted/30"
      style={{
        width: "100%",
        height: "100%",
      }}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/50 bg-muted/50 rounded-t-lg">
        <span className="text-xs font-medium text-foreground/80 truncate">
          {label}
        </span>
        <div
          className="shrink-0 ml-2 p-0.5 rounded hover:bg-muted-foreground/20 text-muted-foreground hover:text-foreground cursor-pointer"
          title="Inspect instruction"
        >
          <Search className="size-3.5" />
        </div>
      </div>
    </div>
  );
}

export const InstructionClusterNodeMemo = memo(InstructionClusterNode);
