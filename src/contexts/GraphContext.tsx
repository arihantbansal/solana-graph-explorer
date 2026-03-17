import { createContext, useContext, useReducer, useMemo, useCallback, type Dispatch, type ReactNode } from "react";
import type { GraphState, GraphAction, AccountNode, AccountEdge } from "@/types/graph";

const initialState: GraphState = {
  nodes: [],
  edges: [],
  selectedNodeId: null,
};

function graphReducer(state: GraphState, action: GraphAction): GraphState {
  switch (action.type) {
    case "ADD_NODES": {
      const existingIds = new Set(state.nodes.map((n) => n.id));
      const newNodes = action.nodes.filter((n) => !existingIds.has(n.id));
      return { ...state, nodes: [...state.nodes, ...newNodes] };
    }
    case "ADD_EDGES": {
      const existingIds = new Set(state.edges.map((e) => e.id));
      const newEdges = action.edges.filter((e) => !existingIds.has(e.id));
      return { ...state, edges: [...state.edges, ...newEdges] };
    }
    case "SET_NODE_DATA": {
      return {
        ...state,
        nodes: state.nodes.map((n) =>
          n.id === action.nodeId
            ? { ...n, data: { ...n.data, ...action.data } }
            : n
        ),
      };
    }
    case "SELECT_NODE":
      return { ...state, selectedNodeId: action.nodeId };
    case "REMOVE_NODE": {
      const nodeId = action.nodeId;
      return {
        ...state,
        nodes: state.nodes.filter((n) => n.id !== nodeId),
        edges: state.edges.filter(
          (e) => e.source !== nodeId && e.target !== nodeId
        ),
        selectedNodeId:
          state.selectedNodeId === nodeId ? null : state.selectedNodeId,
      };
    }
    case "COLLAPSE_CHILDREN": {
      const parentId = action.nodeId;
      // Find edges connected to this node
      const childEdges = state.edges.filter(
        (e) => e.source === parentId || e.target === parentId,
      );
      // Get candidate child node IDs
      const childIds = new Set(
        childEdges.map((e) => (e.source === parentId ? e.target : e.source)),
      );
      // Keep children that have edges to OTHER nodes (not just this parent)
      const sharedChildren = new Set(
        state.edges
          .filter((e) => e.source !== parentId && e.target !== parentId)
          .flatMap((e) => [e.source, e.target])
          .filter((id) => childIds.has(id)),
      );
      const toRemove = new Set([...childIds].filter((id) => !sharedChildren.has(id)));
      return {
        ...state,
        nodes: state.nodes.map((n) =>
          n.id === parentId
            ? { ...n, data: { ...n.data, isExpanded: false } }
            : n,
        ).filter((n) => !toRemove.has(n.id)),
        edges: state.edges.filter(
          (e) => !toRemove.has(e.source) && !toRemove.has(e.target),
        ),
      };
    }
    case "CLEAR":
      return initialState;
    case "SET_NODES":
      return { ...state, nodes: action.nodes };
    case "SET_EDGES":
      return { ...state, edges: action.edges };
  }
}

interface GraphContextValue {
  state: GraphState;
  dispatch: Dispatch<GraphAction>;
  /** Convenience: get the currently selected node */
  selectedNode: AccountNode | undefined;
  /** Convenience: get edges connected to a node */
  getNodeEdges: (nodeId: string) => AccountEdge[];
  /** Memoized Set of all node IDs currently in the graph */
  nodeIds: Set<string>;
}

const GraphContext = createContext<GraphContextValue | null>(null);

export function GraphProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(graphReducer, initialState);

  const selectedNode = useMemo(
    () => state.nodes.find((n) => n.id === state.selectedNodeId),
    [state.nodes, state.selectedNodeId],
  );

  const getNodeEdges = useCallback(
    (nodeId: string) =>
      state.edges.filter((e) => e.source === nodeId || e.target === nodeId),
    [state.edges],
  );

  const nodeIds = useMemo(
    () => new Set(state.nodes.map((n) => n.id)),
    [state.nodes],
  );

  const value = useMemo(
    () => ({ state, dispatch, selectedNode, getNodeEdges, nodeIds }),
    [state, dispatch, selectedNode, getNodeEdges, nodeIds],
  );

  return (
    <GraphContext.Provider value={value}>
      {children}
    </GraphContext.Provider>
  );
}

export function useGraph(): GraphContextValue {
  const ctx = useContext(GraphContext);
  if (!ctx) {
    throw new Error("useGraph must be used within a GraphProvider");
  }
  return ctx;
}
