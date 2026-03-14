import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useGraph } from "@/contexts/GraphContext";
import { useSettings } from "@/contexts/SettingsContext";
import { useExploreAddress } from "@/hooks/useExploreAddress";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { PdaRuleCreator } from "@/components/PdaRuleCreator";
import { BytesFieldDisplay } from "@/components/BytesFieldDisplay";
import { X, GitBranchPlus, ChevronsDownUp, ChevronsUpDown, EyeOff, Eye, ChevronRight } from "lucide-react";
import { CopyButton } from "@/components/CopyButton";
import { TransactionHistory } from "@/components/TransactionHistory";
import { useView } from "@/contexts/ViewContext";
import { useClearAndExplore } from "@/hooks/useClearAndExplore";
import { expandAccount } from "@/engine/expandAccount";
import type { NodeRect } from "@/utils/layout";
import { isPubkey, lamportsToSol } from "@/utils/format";
import { makeIdlFetchedHandler } from "@/utils/programSaver";

/** Recursively render decoded field values — nested objects/arrays shown inline with indentation */
function DecodedValue({
  value,
  depth = 0,
  exploreAddress,
  sourceNodeId,
  fieldName,
}: {
  value: unknown;
  depth?: number;
  exploreAddress: (address: string, meta: { sourceNodeId: string; fieldName: string; depth: number }) => void;
  sourceNodeId: string;
  fieldName: string;
}) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground italic">null</span>;
  }

  if (isPubkey(value)) {
    return (
      <span className="inline-flex items-center gap-1">
        <button
          onClick={() => exploreAddress(value as string, { sourceNodeId, fieldName, depth: 0 })}
          className="text-blue-500 hover:underline cursor-pointer"
          title={`Explore ${value}`}
        >
          {value as string}
        </button>
        <CopyButton value={value as string} iconSize="size-2.5" />
      </span>
    );
  }

  if (typeof value === "bigint") {
    return <span>{value.toString()}</span>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-muted-foreground italic">[]</span>;
    // If all items are primitives, render compact
    const allPrimitive = value.every((v) => typeof v !== "object" || v === null);
    if (allPrimitive) {
      return (
        <div className="space-y-0.5">
          {value.map((item, i) => (
            <div key={i} className="flex items-baseline gap-2">
              <span className="text-muted-foreground/50 text-[10px] select-none">{i}</span>
              <DecodedValue value={item} depth={depth + 1} exploreAddress={exploreAddress} sourceNodeId={sourceNodeId} fieldName={`${fieldName}[${i}]`} />
            </div>
          ))}
        </div>
      );
    }
    return (
      <div className="space-y-1.5">
        {value.map((item, i) => (
          <div key={i} className="border border-muted/40 rounded px-2 py-1.5">
            <div className="text-[10px] text-muted-foreground/60 mb-1">#{i}</div>
            <DecodedValue value={item} depth={depth + 1} exploreAddress={exploreAddress} sourceNodeId={sourceNodeId} fieldName={`${fieldName}[${i}]`} />
          </div>
        ))}
      </div>
    );
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return <span className="text-muted-foreground italic">{"{}"}</span>;
    return (
      <div className="space-y-0.5">
        {entries.map(([k, v]) => {
          const isNested = typeof v === "object" && v !== null && !(v instanceof Uint8Array);
          return (
            <div key={k} className="py-0.5">
              {isNested ? (
                <div>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <ChevronRight className="size-3" />
                    <span className="text-xs">{k}</span>
                  </div>
                  <div className="ml-4 mt-0.5">
                    <DecodedValue value={v} depth={depth + 1} exploreAddress={exploreAddress} sourceNodeId={sourceNodeId} fieldName={`${fieldName}.${k}`} />
                  </div>
                </div>
              ) : (
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="text-muted-foreground whitespace-nowrap">{k}</span>
                  <span className="font-mono text-right break-all">
                    <DecodedValue value={v} depth={depth + 1} exploreAddress={exploreAddress} sourceNodeId={sourceNodeId} fieldName={`${fieldName}.${k}`} />
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return <span>{String(value)}</span>;
}

const MIN_WIDTH = 320;
const DEFAULT_WIDTH = 420;
const MAX_WIDTH = 800;

/** Cache scroll positions per address so navigating back restores position */
const scrollPositionCache = new Map<string, number>();

export function NodeDetailPanel() {
  const { state, dispatch, selectedNode, getNodeEdges, nodeIds } = useGraph();
  const { rpcEndpoint, savedPrograms, saveProgram, collapsedAddresses, getBytesEncoding, setBytesEncoding, isCollapsedAddress, addCollapsedAddress, removeCollapsedAddress } = useSettings();
  const exploreAddress = useExploreAddress();
  const { state: viewState, openTransaction } = useView();
  const clearAndExplore = useClearAndExplore();
  const isMobile = useMediaQuery("(max-width: 1023px)");
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [pdaRuleOpen, setPdaRuleOpen] = useState(false);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevAddressRef = useRef<string | null>(null);

  const isOpen = state.selectedNodeId !== null && selectedNode !== undefined;

  // Save scroll position when switching away from a node
  const currentAddress = selectedNode?.data.address ?? null;
  if (currentAddress !== prevAddressRef.current) {
    if (prevAddressRef.current && scrollRef.current) {
      scrollPositionCache.set(prevAddressRef.current, scrollRef.current.scrollTop);
    }
    prevAddressRef.current = currentAddress;
    // Restore scroll position for new node after render
    if (currentAddress && scrollRef.current) {
      const saved = scrollPositionCache.get(currentAddress);
      scrollRef.current.scrollTop = saved ?? 0;
    }
  }

  // Also restore after initial mount/render via effect
  useEffect(() => {
    if (currentAddress && scrollRef.current) {
      const saved = scrollPositionCache.get(currentAddress);
      scrollRef.current.scrollTop = saved ?? 0;
    }
  }, [currentAddress]);
  const edges = selectedNode ? getNodeEdges(selectedNode.id) : [];

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

  if (!isOpen || !selectedNode) return null;

  // Filter decoded fields: hide pubkey values already on the graph
  const decodedEntries = useMemo(
    () => selectedNode.data.decodedData
      ? Object.entries(selectedNode.data.decodedData).filter(
          ([, value]) => !isPubkey(value) || !nodeIds.has(value),
        )
      : [],
    [selectedNode.data.decodedData, nodeIds],
  );

  const content = (
    <>
      {/* Content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden min-w-0 w-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 pb-2 sticky top-0 bg-background z-10 gap-2">
          <h3 className="text-sm font-semibold truncate">Account Details</h3>
          {!isMobile && (
            <button
              onClick={() => dispatch({ type: "SELECT_NODE", nodeId: null })}
              className="rounded-sm hover:bg-muted p-0.5 shrink-0"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        <div className="px-4 pb-2">
          <div className="flex items-start gap-1">
            {viewState.mode === "transaction" ? (
              <button
                onClick={() => clearAndExplore(selectedNode.data.address)}
                className="font-mono text-xs text-blue-500 hover:underline break-all text-left cursor-pointer"
                title="Explore this account"
              >
                {selectedNode.data.address}
              </button>
            ) : (
              <div className="font-mono text-xs text-muted-foreground break-all">
                {selectedNode.data.address}
              </div>
            )}
            <CopyButton value={selectedNode.data.address} />
          </div>
        </div>

        <div className="px-4 space-y-4 pb-6">
          {/* Type */}
          {selectedNode.data.accountType && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-1">
                Type
              </h4>
              <Badge variant="secondary">
                {selectedNode.data.accountType}
              </Badge>
            </div>
          )}

          {/* Thumbnail */}
          {selectedNode.data.thumbnail && (
            <div>
              <img
                src={selectedNode.data.thumbnail}
                alt=""
                className="w-full max-h-48 object-cover rounded"
              />
            </div>
          )}

          {/* Program */}
          {selectedNode.data.programName && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-1">
                Program
              </h4>
              <div className="text-sm">{selectedNode.data.programName}</div>
              {selectedNode.data.programId && (
                <div className="flex items-start gap-1">
                  <div className="font-mono text-[10px] text-muted-foreground break-all">
                    {selectedNode.data.programId}
                  </div>
                  <CopyButton value={selectedNode.data.programId} iconSize="size-2.5" />
                </div>
              )}
            </div>
          )}

          {/* Balance */}
          {selectedNode.data.balance !== undefined && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-1">
                Balance
              </h4>
              <div className="text-sm font-mono">
                {lamportsToSol(selectedNode.data.balance, 9)} SOL
              </div>
            </div>
          )}

          {/* Decoded Fields */}
          {decodedEntries.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-1">
                Decoded Fields
              </h4>
              <div className="space-y-0.5">
                {decodedEntries.map(([key, value]) => {
                  if (value instanceof Uint8Array) {
                    return (
                      <div key={key} className="py-1.5 border-b border-muted/30 last:border-0">
                        <div className="text-xs text-muted-foreground mb-1">{key}</div>
                        <BytesFieldDisplay
                          bytes={value}
                          fieldName={key}
                          defaultEncoding={
                            selectedNode.data.accountType
                              ? getBytesEncoding(selectedNode.data.accountType, key)
                              : undefined
                          }
                          onEncodingChange={(enc) => {
                            if (selectedNode.data.accountType) {
                              setBytesEncoding(selectedNode.data.accountType, key, enc);
                            }
                          }}
                        />
                      </div>
                    );
                  }
                  const isNested = typeof value === "object" && value !== null;
                  if (isNested) {
                    return (
                      <div key={key} className="py-1.5 border-b border-muted/30 last:border-0">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                          <ChevronRight className="size-3" />
                          <span>{key}</span>
                        </div>
                        <div className="ml-4 text-xs font-mono">
                          <DecodedValue
                            value={value}
                            exploreAddress={exploreAddress}
                            sourceNodeId={selectedNode.id}
                            fieldName={key}
                          />
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div
                      key={key}
                      className="flex items-baseline justify-between gap-3 py-1 border-b border-muted/30 last:border-0 text-xs"
                    >
                      <span className="text-muted-foreground whitespace-nowrap">
                        {key}
                      </span>
                      <span className="font-mono text-right break-all">
                        <DecodedValue
                          value={value}
                          exploreAddress={exploreAddress}
                          sourceNodeId={selectedNode.id}
                          fieldName={key}
                        />
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Transaction History */}
          <TransactionHistory
            address={selectedNode.data.address}
            rpcUrl={rpcEndpoint}
            onTransactionClick={openTransaction}
          />

          {/* Connected Edges */}
          {edges.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-1">
                Relationships ({edges.length})
              </h4>
              <div className="space-y-1">
                {edges.map((edge) => (
                  <div
                    key={edge.id}
                    className="text-xs flex items-center gap-1.5 min-w-0"
                  >
                    <Badge variant="outline" className="text-[9px] px-1 shrink-0">
                      {edge.data?.relationshipType}
                    </Badge>
                    <span className="truncate" title={edge.data?.label}>
                      {edge.data?.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {selectedNode.data.error && (
            <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
              {selectedNode.data.error}
            </div>
          )}

        </div>

        {/* Action buttons — sticky at bottom */}
        <div className="sticky bottom-0 bg-background border-t p-4 space-y-2">
          {/* Expand / Collapse children */}
          {selectedNode.data.isExpanded && edges.length > 0 ? (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => dispatch({ type: "COLLAPSE_CHILDREN", nodeId: selectedNode.id })}
            >
              <ChevronsDownUp className="size-3.5 mr-1" />
              Collapse Children
            </Button>
          ) : !selectedNode.data.isExpanded && !selectedNode.data.isLoading && selectedNode.data.decodedData ? (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                const existingIds = new Set(state.nodes.map((n) => n.id));
                const existingRects: NodeRect[] = state.nodes.map((n) => ({
                  x: n.position.x,
                  y: n.position.y,
                  width: n.measured?.width ?? 280,
                  height: n.measured?.height ?? 500,
                }));
                expandAccount({
                  address: selectedNode.id,
                  sourcePosition: selectedNode.position,
                  rpcUrl: rpcEndpoint,
                  existingNodeIds: existingIds,
                  dispatch,
                  options: {
                    onIdlFetched: makeIdlFetchedHandler(saveProgram),
                    collapsedAddresses: new Set(collapsedAddresses),
                  },
                  existingRects,
                });
              }}
            >
              <ChevronsUpDown className="size-3.5 mr-1" />
              Expand
            </Button>
          ) : null}

          {/* Always collapse toggle */}
          <Button
            variant={isCollapsedAddress(selectedNode.data.address) ? "secondary" : "outline"}
            size="sm"
            className="w-full"
            onClick={() => {
              const addr = selectedNode.data.address;
              if (isCollapsedAddress(addr)) {
                removeCollapsedAddress(addr);
                // Reset isExpanded so the node can be re-expanded by double-click
                if (selectedNode.data.isExpanded) {
                  dispatch({
                    type: "SET_NODE_DATA",
                    nodeId: selectedNode.id,
                    data: { isExpanded: false },
                  });
                }
              } else {
                addCollapsedAddress(addr);
                // Also collapse now if expanded
                if (selectedNode.data.isExpanded && edges.length > 0) {
                  dispatch({ type: "COLLAPSE_CHILDREN", nodeId: selectedNode.id });
                }
              }
            }}
          >
            {isCollapsedAddress(selectedNode.data.address) ? (
              <>
                <Eye className="size-3.5 mr-1" />
                Stop Always Collapsing
              </>
            ) : (
              <>
                <EyeOff className="size-3.5 mr-1" />
                Always Collapse
              </>
            )}
          </Button>

          {/* Derive PDA */}
          {selectedNode.data.decodedData && savedPrograms.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setPdaRuleOpen(true)}
            >
              <GitBranchPlus className="size-3.5 mr-1" />
              Derive PDA...
            </Button>
          )}
        </div>
      </div>

      {/* PDA Rule Creator Dialog */}
      {pdaRuleOpen && (
        <PdaRuleCreator
          open={pdaRuleOpen}
          onOpenChange={setPdaRuleOpen}
          nodeId={selectedNode.id}
          nodeData={selectedNode.data}
        />
      )}
    </>
  );

  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={(open) => { if (!open) dispatch({ type: "SELECT_NODE", nodeId: null }); }}>
        <SheetContent side="right" className="w-full sm:w-full p-0 overflow-y-auto" showCloseButton={true}>
          <div className="flex flex-col h-full">
            {content}
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop: existing resizable sidebar
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
      {content}
    </div>
  );
}
