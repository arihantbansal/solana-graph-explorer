import type { AccountNode, AccountEdge, AccountNodeData } from "@/types/graph";
import type { Relationship } from "@/types/relationships";
import { circularLayout } from "@/utils/layout";

export interface GraphExpansionResult {
  nodes: AccountNode[];
  edges: AccountEdge[];
}

/**
 * Build React Flow nodes and edges from a set of relationships.
 * Places new nodes in a circle around the source node.
 */
export function buildExpansionGraph(
  sourceNodeId: string,
  sourcePosition: { x: number; y: number },
  relationships: Relationship[],
  existingNodeIds: Set<string>,
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

  const edges: AccountEdge[] = relationships.map((rel) => ({
    id: `${rel.sourceAddress}-${rel.targetAddress}-${rel.type}-${rel.label}`,
    source: rel.sourceAddress,
    target: rel.targetAddress,
    type: "account",
    data: {
      relationshipType: rel.type,
      label: rel.label,
      fieldName: "fieldName" in rel ? (rel as { fieldName: string }).fieldName : undefined,
    },
  }));

  return { nodes, edges };
}
