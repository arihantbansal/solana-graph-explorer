import { useMemo } from "react";
import { getIdl } from "@/solana/idlCache";
import { CopyButton } from "@/components/CopyButton";
import { Badge } from "@/components/ui/badge";

interface IdlViewerProps {
  programAddress: string;
}

export function IdlViewer({ programAddress }: IdlViewerProps) {
  const idl = getIdl(programAddress);

  const formatted = useMemo(() => {
    if (!idl) return null;
    return JSON.stringify(idl, null, 2);
  }, [idl]);

  if (!idl || !formatted) {
    return <div className="text-xs text-muted-foreground">No IDL available</div>;
  }

  const instructionCount = idl.instructions?.length ?? 0;
  const accountCount = idl.accounts?.length ?? 0;
  const typeCount = idl.types?.length ?? 0;

  return (
    <div className="space-y-3">
      {/* IDL metadata */}
      <div className="space-y-1.5">
        {idl.metadata?.name && (
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="text-muted-foreground">Name</span>
            <span className="font-mono">{idl.metadata.name}</span>
          </div>
        )}
        {idl.metadata?.version && (
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="text-muted-foreground">Version</span>
            <span className="font-mono">{idl.metadata.version}</span>
          </div>
        )}
        {idl.metadata?.spec && (
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="text-muted-foreground">Spec</span>
            <span className="font-mono">{idl.metadata.spec}</span>
          </div>
        )}
        <div className="flex gap-1.5 flex-wrap">
          {instructionCount > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              {instructionCount} instructions
            </Badge>
          )}
          {accountCount > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              {accountCount} accounts
            </Badge>
          )}
          {typeCount > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              {typeCount} types
            </Badge>
          )}
        </div>
      </div>

      {/* Full IDL JSON */}
      <div className="relative">
        <div className="absolute top-1.5 right-1.5 z-10">
          <CopyButton value={formatted} iconSize="size-3" />
        </div>
        <pre className="text-[10px] font-mono bg-muted/50 rounded p-2 overflow-auto max-h-[600px] leading-relaxed whitespace-pre-wrap break-all">
          {formatted}
        </pre>
      </div>
    </div>
  );
}
