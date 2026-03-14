import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/CopyButton";
import type { InstructionDetail } from "@/engine/instructionGraphBuilder";
import { flattenArgs, formatLeafValue } from "@/utils/flattenArgs";
import { isPubkey } from "@/utils/format";

const MIN_WIDTH = 320;
const DEFAULT_WIDTH = 420;
const MAX_WIDTH = 800;

function ArgsFieldList({ args, onAddressClick }: { args: Record<string, unknown>; onAddressClick?: (address: string) => void }) {
  const entries = useMemo(() => flattenArgs(args), [args]);
  if (entries.length === 0) return null;

  return (
    <div>
      <h4 className="text-xs font-medium text-muted-foreground mb-1">Arguments</h4>
      <div className="space-y-0.5">
        {entries.map(([key, value]) => {
          const strValue = formatLeafValue(value);
          const pubkey = typeof value === "string" && isPubkey(value);
          return (
            <div
              key={key}
              className="flex items-baseline justify-between gap-3 py-1 border-b border-muted/30 last:border-0 text-xs"
            >
              <span className="text-muted-foreground whitespace-nowrap">{key}</span>
              <span className="font-mono text-right break-all">
                {pubkey ? (
                  <span className="inline-flex items-center gap-1">
                    {onAddressClick ? (
                      <button
                        className="text-blue-500 hover:underline cursor-pointer"
                        onClick={() => onAddressClick(value as string)}
                      >
                        {value as string}
                      </button>
                    ) : (
                      <span className="text-blue-500">{value as string}</span>
                    )}
                    <CopyButton value={value as string} iconSize="size-2.5" />
                  </span>
                ) : (
                  strValue
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AccountsList({
  accounts,
  onAddressClick,
}: {
  accounts: InstructionDetail["accounts"];
  onAddressClick?: (address: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      {accounts.map((acc) => (
        <div
          key={acc.index}
          className="border border-border/50 rounded p-2 space-y-1"
        >
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground w-4 shrink-0">
              #{acc.index}
            </span>
            <span className="text-xs font-medium truncate">{acc.name}</span>
            {acc.isSigner && (
              <Badge variant="outline" className="text-[9px] px-1 py-0 border-amber-500/50 text-amber-600 shrink-0">
                Signer
              </Badge>
            )}
            {acc.isWritable && (
              <Badge variant="outline" className="text-[9px] px-1 py-0 border-orange-500/50 text-orange-600 shrink-0">
                Writable
              </Badge>
            )}
          </div>
          <div className="flex items-start gap-1">
            {onAddressClick ? (
              <button
                className="font-mono text-[10px] text-blue-500 hover:underline break-all text-left cursor-pointer"
                onClick={() => onAddressClick(acc.address)}
              >
                {acc.address}
              </button>
            ) : (
              <div className="font-mono text-[10px] text-muted-foreground break-all">
                {acc.address}
              </div>
            )}
            <CopyButton value={acc.address} iconSize="size-2.5" />
          </div>
          {acc.pdaSeeds && (
            <div className="text-[9px] text-muted-foreground/70 font-mono">
              PDA: [{acc.pdaSeeds}]
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

interface InstructionDetailPanelProps {
  detail: InstructionDetail;
  onClose: () => void;
  onAddressClick?: (address: string) => void;
}

export function InstructionDetailPanel({ detail, onClose, onAddressClick }: InstructionDetailPanelProps) {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = width;
    e.preventDefault();
  }, [width]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = startX.current - e.clientX;
      setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth.current + delta)));
    };
    const onMouseUp = () => {
      isDragging.current = false;
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  return (
    <div
      className="flex bg-background border-l shadow-lg overflow-hidden shrink-0"
      style={{ width, maxWidth: "80vw" }}
    >
      {/* Drag handle */}
      <div
        className="w-1.5 cursor-col-resize hover:bg-blue-400/50 active:bg-blue-500/50 shrink-0"
        onMouseDown={onMouseDown}
      />

      <div className="flex-1 overflow-y-auto overflow-x-hidden min-w-0 w-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 pb-2 sticky top-0 bg-background z-10 gap-2">
          <h3 className="text-sm font-semibold truncate">Instruction Details</h3>
          <button
            onClick={onClose}
            className="rounded-sm hover:bg-muted p-0.5 shrink-0"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="px-4 space-y-4 pb-6">
          {/* Program */}
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-1">Program</h4>
            <div className="text-sm font-medium">{detail.programName}</div>
            <div className="flex items-start gap-1">
              <div className="font-mono text-[10px] text-muted-foreground break-all">
                {detail.programId}
              </div>
              <CopyButton value={detail.programId} iconSize="size-2.5" />
            </div>
          </div>

          {/* Instruction Name */}
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-1">Instruction</h4>
            <div className="text-sm font-medium">
              #{detail.instructionIndex} {detail.instructionName}
            </div>
            <div
              className="font-mono text-[10px] text-muted-foreground truncate mt-0.5"
              title={detail.rawData}
            >
              {detail.rawData.length > 80 ? detail.rawData.slice(0, 76) + "..." : detail.rawData}
            </div>
          </div>

          {/* Accounts Table */}
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-1">
              Accounts ({detail.accounts.length})
            </h4>
            <AccountsList accounts={detail.accounts} onAddressClick={onAddressClick} />
          </div>

          {/* Decoded Args */}
          {detail.args && Object.keys(detail.args).length > 0 && (
            <ArgsFieldList args={detail.args} onAddressClick={onAddressClick} />
          )}

          {/* Inner Instructions (CPI calls) */}
          {detail.innerInstructions && detail.innerInstructions.length > 0 && (
            <div className="space-y-4">
              <h4 className="text-xs font-medium text-muted-foreground border-t border-border pt-3">
                Inner Instructions ({detail.innerInstructions.length})
              </h4>
              {detail.innerInstructions.map((inner, idx) => (
                <div key={idx} className="space-y-3 pl-3 border-l-2 border-purple-500/30">
                  {/* Inner program info */}
                  <div>
                    <div className="text-xs font-medium">
                      ↳ {inner.instructionName} ({inner.programName})
                    </div>
                    <div className="flex items-start gap-1">
                      <div className="font-mono text-[10px] text-muted-foreground break-all">
                        {inner.programId}
                      </div>
                      <CopyButton value={inner.programId} iconSize="size-2.5" />
                    </div>
                  </div>

                  {/* Inner accounts */}
                  {inner.accounts.length > 0 && (
                    <div>
                      <h5 className="text-[10px] font-medium text-muted-foreground mb-1">
                        Accounts ({inner.accounts.length})
                      </h5>
                      <AccountsList accounts={inner.accounts} onAddressClick={onAddressClick} />
                    </div>
                  )}

                  {/* Inner decoded args */}
                  {inner.args && Object.keys(inner.args).length > 0 && (
                    <ArgsFieldList args={inner.args} onAddressClick={onAddressClick} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
