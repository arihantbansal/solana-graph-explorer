import { memo, useMemo } from "react";
import type { NodeProps } from "@xyflow/react";
import { Card, CardContent } from "@/components/ui/card";
import { flattenArgs, formatLeafValue } from "@/utils/flattenArgs";

interface ArgsNodeData {
  args: Record<string, unknown>;
  [key: string]: unknown;
}

function ArgsNodeComponent({ data }: NodeProps) {
  const { args } = data as ArgsNodeData;
  const entries = useMemo(() => flattenArgs(args), [args]);

  if (entries.length === 0) return null;

  return (
    <Card className="min-w-[180px] max-w-[360px] shadow-sm border-dashed">
      <CardContent className="p-2 space-y-0.5">
        <div className="text-[10px] font-medium text-muted-foreground mb-1">
          Arguments
        </div>
        {entries.map(([key, value]) => {
          const display = formatLeafValue(value);
          return (
            <div key={key} className="flex justify-between gap-3 text-[10px]">
              <span className="text-muted-foreground shrink-0">{key}</span>
              <span className="font-mono truncate text-right max-w-[200px]" title={display}>
                {display.length > 40 ? display.slice(0, 36) + "..." : display}
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export const ArgsNodeMemo = memo(ArgsNodeComponent);
