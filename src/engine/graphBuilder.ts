import type { AccountNode, AccountEdge, AccountNodeData } from "@/types/graph";
import type { Relationship } from "@/types/relationships";
import { circularLayout, type NodeRect } from "@/utils/layout";

export interface GraphExpansionResult {
  nodes: AccountNode[];
  edges: AccountEdge[];
}

/**
 * Build React Flow nodes and edges from a set of relationships.
 * Places new nodes in a circle around the source node, avoiding existing nodes.
 */
export function buildExpansionGraph(
  sourceNodeId: string,
  sourcePosition: { x: number; y: number },
  relationships: Relationship[],
  existingNodeIds: Set<string>,
  existingRects: NodeRect[] = [],
): GraphExpansionResult {
  // Collect unique target addresses that aren't already in the graph
  const newAddresses = [
    ...new Set(
      relationships
        .map((r) => r.targetAddress)
        .filter((addr) => addr !== sourceNodeId && !existingNodeIds.has(addr)),
    ),
  ];

  const positions = circularLayout(
    sourcePosition.x,
    sourcePosition.y,
    newAddresses.length,
    existingRects,
  );

  const nodes: AccountNode[] = newAddresses.map((addr, i) => ({
    id: addr,
    type: "account",
    position: positions[i],
    data: {
      address: addr,
      isExpanded: false,
      isLoading: true,
    } as AccountNodeData,
  }));

  // Deduplicate edges by source+target+type so we don't get multiple
  // PDA seed edges to the same account from different instructions
  const edgeMap = new Map<string, AccountEdge>();
  for (const rel of relationships) {
    const key = `${rel.sourceAddress}-${rel.targetAddress}-${rel.type}`;
    if (!edgeMap.has(key)) {
      edgeMap.set(key, {
        id: `${rel.sourceAddress}-${rel.targetAddress}-${rel.type}-${rel.label}`,
        source: rel.sourceAddress,
        target: rel.targetAddress,
        type: "account",
        data: {
          relationshipType: rel.type,
          label: rel.label,
          fieldName: "fieldName" in rel ? (rel as { fieldName: string }).fieldName : undefined,
        },
      });
    }
  }
  const edges = [...edgeMap.values()];

  return { nodes, edges };
}
