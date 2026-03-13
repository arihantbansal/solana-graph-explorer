import { useState, useCallback, useRef, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useGraph } from "@/contexts/GraphContext";
import { useSettings } from "@/contexts/SettingsContext";
import { useExploreAddress } from "@/hooks/useExploreAddress";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { PdaRuleCreator } from "@/components/PdaRuleCreator";
import { BytesFieldDisplay } from "@/components/BytesFieldDisplay";
import { X, GitBranchPlus, ChevronsDownUp, ChevronsUpDown, EyeOff, Eye } from "lucide-react";
import { CopyButton } from "@/components/CopyButton";
import { expandAccount } from "@/engine/expandAccount";
import type { NodeRect } from "@/utils/layout";
import { isPubkey, lamportsToSol } from "@/utils/format";
import { makeIdlFetchedHandler } from "@/utils/programSaver";

const MIN_WIDTH = 320;
const DEFAULT_WIDTH = 420;
const MAX_WIDTH = 800;

export function NodeDetailPanel() {
  const { state, dispatch, selectedNode, getNodeEdges } = useGraph();
  const { rpcEndpoint, savedPrograms, saveProgram, collapsedAddresses, getBytesEncoding, setBytesEncoding, isCollapsedAddress, addCollapsedAddress, removeCollapsedAddress } = useSettings();
  const exploreAddress = useExploreAddress();
  const isMobile = useMediaQuery("(max-width: 1023px)");
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [pdaRuleOpen, setPdaRuleOpen] = useState(false);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const isOpen = state.selectedNodeId !== null && selectedNode !== undefined;
  const edges = selectedNode ? getNodeEdges(selectedNode.id) : [];

  const existingNodeIds = new Set(state.nodes.map((n) => n.id));

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
  const decodedEntries = selectedNode.data.decodedData
    ? Object.entries(selectedNode.data.decodedData).filter(
        ([, value]) => !isPubkey(value) || !existingNodeIds.has(value),
      )
    : [];

  const content = (
    <>
      {/* Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden min-w-0 w-full flex flex-col">
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
            <div className="font-mono text-xs text-muted-foreground break-all">
              {selectedNode.data.address}
            </div>
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
                {decodedEntries.map(([key, value]) =>
                  value instanceof Uint8Array ? (
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
                  ) : (
                    <div
                      key={key}
                      className="flex items-baseline justify-between gap-3 py-1 border-b border-muted/30 last:border-0 text-xs"
                    >
                      <span className="text-muted-foreground whitespace-nowrap">
                        {key}
                      </span>
                      <span className="font-mono text-right break-all">
                        {isPubkey(value) ? (
                          <span className="inline-flex items-center gap-1">
                            <button
                              onClick={() =>
                                exploreAddress(value, {
                                  sourceNodeId: selectedNode.id,
                                  fieldName: key,
                                  depth: 0,
                                })
                              }
                              className="text-blue-500 hover:underline"
                              title={`Explore ${value}`}
                            >
                              {value}
                            </button>
                            <CopyButton value={value} iconSize="size-2.5" />
                          </span>
                        ) : typeof value === "object" && value !== null ? (
                          JSON.stringify(value, (_, v) =>
                            typeof v === "bigint" ? v.toString() : v,
                          ).slice(0, 60)
                        ) : (
                          String(value)
                        )}
                      </span>
                    </div>
                  ),
                )}
              </div>
            </div>
          )}

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
