import { useCallback } from "react";
import { useGraph } from "@/contexts/GraphContext";
import { useSettings } from "@/contexts/SettingsContext";
import { expandAccount } from "@/engine/expandAccount";
import type { AccountNode, AccountEdge } from "@/types/graph";
import { makeIdlFetchedHandler } from "@/utils/programSaver";

/**
 * Find a position near a target that doesn't overlap existing nodes.
 */
function findNonOverlappingPosition(
  targetX: number,
  targetY: number,
  existingPositions: { x: number; y: number }[],
  nodeWidth = 320,
  nodeHeight = 400,
): { x: number; y: number } {
  let pos = { x: targetX, y: targetY };

  for (let attempt = 0; attempt < 20; attempt++) {
    const overlaps = existingPositions.some(
      (p) =>
        Math.abs(p.x - pos.x) < nodeWidth &&
        Math.abs(p.y - pos.y) < nodeHeight,
    );
    if (!overlaps) return pos;

    // Place to the right, then wrap to next row
    pos = {
      x: targetX + (attempt % 3) * (nodeWidth + 40),
      y: targetY + Math.floor(attempt / 3) * (nodeHeight + 40),
    };
  }

  return pos;
}

export interface ExploreOptions {
  /** Source node ID — used to position the new node relative to source and create an edge */
  sourceNodeId?: string;
  /** Field name on the source that points to this address */
  fieldName?: string;
  /** Override expansion depth for this explore (default: 1, just load immediate children) */
  depth?: number;
  /** If true, don't auto-select the node after adding it */
  skipSelect?: boolean;
}

/**
 * Returns a callback that adds an address to the graph and fetches it.
 * If sourceNodeId is provided, positions the new node relative to it and creates an edge.
 * If the address is already on the graph, it selects that node instead.
 */
export function useExploreAddress() {
  const { state, dispatch } = useGraph();
  const { rpcEndpoint, saveProgram, collapsedAddresses, expansionDepth } = useSettings();

  return useCallback(
    (address: string, options?: ExploreOptions) => {
      const { sourceNodeId, fieldName, depth } = options ?? {};

      // If already on the graph, just select it (and add edge if needed)
      const existing = state.nodes.find((n) => n.id === address);
      if (existing) {
        if (!options?.skipSelect) dispatch({ type: "SELECT_NODE", nodeId: address });
        if (sourceNodeId) {
          const edgeId = `${sourceNodeId}-${address}-has_one-${fieldName ?? address}`;
          const alreadyEdged = state.edges.some((e) => e.id === edgeId);
          if (!alreadyEdged) {
            const edge: AccountEdge = {
              id: edgeId,
              source: sourceNodeId,
              target: address,
              data: {
                relationshipType: "has_one",
                label: fieldName ?? address,
                fieldName,
              },
            };
            dispatch({ type: "ADD_EDGES", edges: [edge] });
          }
        }
        return;
      }

      // Calculate position
      const existingPositions = state.nodes.map((n) => n.position);
      let position: { x: number; y: number };

      if (sourceNodeId) {
        const sourceNode = state.nodes.find((n) => n.id === sourceNodeId);
        if (sourceNode) {
          // Place to the right of the source node
          position = findNonOverlappingPosition(
            sourceNode.position.x + 360,
            sourceNode.position.y,
            existingPositions,
          );
        } else {
          position = findNonOverlappingPosition(400, 300, existingPositions);
        }
      } else {
        position = findNonOverlappingPosition(400, 300, existingPositions);
      }

      const node: AccountNode = {
        id: address,
        type: "account",
        position,
        data: {
          address,
          isExpanded: false,
          isLoading: true,
        },
      };
      dispatch({ type: "ADD_NODES", nodes: [node] });

      // Create edge from source to new node
      if (sourceNodeId) {
        const edge: AccountEdge = {
          id: `${sourceNodeId}-${address}-has_one-${fieldName ?? address}`,
          source: sourceNodeId,
          target: address,
          data: {
            relationshipType: "has_one",
            label: fieldName ?? address,
            fieldName,
          },
        };
        dispatch({ type: "ADD_EDGES", edges: [edge] });
      }

      if (!options?.skipSelect) dispatch({ type: "SELECT_NODE", nodeId: address });

      const existingIds = new Set(state.nodes.map((n) => n.id));
      existingIds.add(address);
      expandAccount(address, position, rpcEndpoint, existingIds, dispatch, {
        onIdlFetched: makeIdlFetchedHandler(saveProgram),
        collapsedAddresses: new Set(collapsedAddresses),
        depth: depth ?? 1,
      });
    },
    [state.nodes, state.edges, dispatch, rpcEndpoint, saveProgram, collapsedAddresses, expansionDepth],
  );
}
