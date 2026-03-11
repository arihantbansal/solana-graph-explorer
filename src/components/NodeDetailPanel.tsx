import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { useGraph } from "@/contexts/GraphContext";

function lamportsToSol(lamports: number): string {
  return (lamports / 1_000_000_000).toFixed(9);
}

export function NodeDetailPanel() {
  const { state, dispatch, selectedNode, getNodeEdges } = useGraph();

  const isOpen = state.selectedNodeId !== null && selectedNode !== undefined;

  const edges = selectedNode ? getNodeEdges(selectedNode.id) : [];

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) dispatch({ type: "SELECT_NODE", nodeId: null });
      }}
    >
      <SheetContent side="right" className="overflow-y-auto">
        {selectedNode && (
          <>
            <SheetHeader>
              <SheetTitle className="text-sm">Account Details</SheetTitle>
              <SheetDescription className="font-mono text-xs break-all">
                {selectedNode.data.address}
              </SheetDescription>
            </SheetHeader>

            <div className="px-4 space-y-4">
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

              {/* Program */}
              {selectedNode.data.programName && (
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-1">
                    Program
                  </h4>
                  <div className="text-sm">{selectedNode.data.programName}</div>
                  {selectedNode.data.programId && (
                    <div className="font-mono text-[10px] text-muted-foreground break-all">
                      {selectedNode.data.programId}
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
                    {lamportsToSol(selectedNode.data.balance)} SOL
                  </div>
                </div>
              )}

              {/* Decoded Fields */}
              {selectedNode.data.decodedData &&
                Object.keys(selectedNode.data.decodedData).length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground mb-1">
                      Decoded Fields
                    </h4>
                    <div className="space-y-1">
                      {Object.entries(selectedNode.data.decodedData).map(
                        ([key, value]) => (
                          <div
                            key={key}
                            className="flex justify-between text-xs"
                          >
                            <span className="text-muted-foreground">{key}</span>
                            <span className="font-mono truncate max-w-[160px]">
                              {String(value)}
                            </span>
                          </div>
                        )
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
                        className="text-xs flex items-center gap-1.5"
                      >
                        <Badge variant="outline" className="text-[9px] px-1">
                          {edge.data?.relationshipType}
                        </Badge>
                        <span className="truncate">
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
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
