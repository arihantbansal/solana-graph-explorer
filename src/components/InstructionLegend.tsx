import { Panel, useReactFlow } from "@xyflow/react";
import type { InstructionCluster } from "@/engine/instructionGraphBuilder";

interface InstructionLegendProps {
  clusters: InstructionCluster[];
  /** Currently active filter: null = show all, { clusterIdx, innerIdx } = filter to inner ix */
  activeFilter: { clusterIdx: number; innerIdx: number } | null;
  onFilterChange: (filter: { clusterIdx: number; innerIdx: number } | null) => void;
}

export function InstructionLegend({ clusters, activeFilter, onFilterChange }: InstructionLegendProps) {
  const { fitView } = useReactFlow();

  if (clusters.length === 0) return null;

  const handleTopLevelClick = (cluster: InstructionCluster, clusterIdx: number) => {
    // If clicking the already-active cluster's parent, clear filter
    if (activeFilter && activeFilter.clusterIdx === clusterIdx) {
      onFilterChange(null);
    }
    // Always fitView to this cluster
    const nodeIds = cluster.nodes.map((n) => n.id);
    fitView({
      nodes: nodeIds.map((id) => ({ id })),
      duration: 400,
      padding: 0.3,
    });
    // Clear any inner filter
    onFilterChange(null);
  };

  const handleInnerClick = (cluster: InstructionCluster, clusterIdx: number, innerIdx: number) => {
    const inner = cluster.innerInstructions[innerIdx];
    if (!inner) return;

    const isAlreadyActive =
      activeFilter?.clusterIdx === clusterIdx && activeFilter?.innerIdx === innerIdx;

    if (isAlreadyActive) {
      // Toggle off — show all
      onFilterChange(null);
      const nodeIds = cluster.nodes.map((n) => n.id);
      fitView({
        nodes: nodeIds.map((id) => ({ id })),
        duration: 400,
        padding: 0.3,
      });
    } else {
      // Activate filter
      onFilterChange({ clusterIdx, innerIdx });
      // FitView to just the filtered nodes
      const visibleNodeIds = Array.from(inner.nodeIds);
      if (visibleNodeIds.length > 0) {
        fitView({
          nodes: visibleNodeIds.map((id) => ({ id })),
          duration: 400,
          padding: 0.3,
        });
      }
    }
  };

  return (
    <Panel position="top-left" className="!m-2">
      <div className="bg-background/90 backdrop-blur-sm border rounded-lg shadow-md text-xs max-w-[300px]">
        <div className="px-2.5 py-1.5 text-muted-foreground font-medium border-b">
          Instructions
        </div>
        <div className="max-h-72 overflow-y-auto">
          {clusters.map((cluster, clusterIdx) => (
            <div key={cluster.clusterId}>
              <button
                onClick={() => handleTopLevelClick(cluster, clusterIdx)}
                className="w-full text-left px-2.5 py-1.5 hover:bg-muted truncate text-muted-foreground hover:text-foreground transition-colors"
                title={cluster.label}
              >
                {cluster.label}
              </button>
              {cluster.innerInstructions.map((inner, innerIdx) => {
                const isActive =
                  activeFilter?.clusterIdx === clusterIdx &&
                  activeFilter?.innerIdx === innerIdx;
                return (
                  <button
                    key={`${cluster.clusterId}-inner-${innerIdx}`}
                    onClick={() => handleInnerClick(cluster, clusterIdx, innerIdx)}
                    className={`w-full text-left pl-5 pr-2.5 py-1 truncate transition-colors text-[10px] ${
                      isActive
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground/70 hover:bg-muted hover:text-foreground"
                    }`}
                    title={`${inner.label}${isActive ? " (click to show all)" : ""}`}
                  >
                    {inner.label}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}
