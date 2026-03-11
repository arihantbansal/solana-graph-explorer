import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from "react";
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
}

const GraphContext = createContext<GraphContextValue | null>(null);

export function GraphProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(graphReducer, initialState);

  const selectedNode = state.nodes.find((n) => n.id === state.selectedNodeId);
  const getNodeEdges = (nodeId: string) =>
    state.edges.filter((e) => e.source === nodeId || e.target === nodeId);

  return (
    <GraphContext.Provider value={{ state, dispatch, selectedNode, getNodeEdges }}>
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
