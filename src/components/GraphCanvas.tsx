import { useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type NodeMouseHandler,
  type OnNodesChange,
  type OnEdgesChange,
  applyNodeChanges,
  applyEdgeChanges,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { AccountNode, AccountEdge } from "@/types/graph";
import { useGraph } from "@/contexts/GraphContext";
import { AccountNodeComponent } from "@/components/AccountNode";
import { AccountEdgeComponent } from "@/components/AccountEdge";

// MUST be defined outside component per React Flow requirement
const nodeTypes = {
  account: AccountNodeComponent,
};

const edgeTypes = {
  account: AccountEdgeComponent,
};

export function GraphCanvas() {
  const { state, dispatch } = useGraph();

  const onNodesChange: OnNodesChange<AccountNode> = useCallback(
    (changes) => {
      dispatch({
        type: "SET_NODES",
        nodes: applyNodeChanges(changes, state.nodes),
      });
    },
    [dispatch, state.nodes]
  );

  const onEdgesChange: OnEdgesChange<AccountEdge> = useCallback(
    (changes) => {
      dispatch({
        type: "SET_EDGES",
        edges: applyEdgeChanges(changes, state.edges),
      });
    },
    [dispatch, state.edges]
  );

  const onNodeClick: NodeMouseHandler<AccountNode> = useCallback(
    (_event, node) => {
      dispatch({ type: "SELECT_NODE", nodeId: node.id });
    },
    [dispatch]
  );

  const onNodeDoubleClick: NodeMouseHandler<AccountNode> = useCallback(
    (_event, _node) => {
      // placeholder: will trigger expand/fetch in future
    },
    []
  );

  const onPaneClick = useCallback(() => {
    dispatch({ type: "SELECT_NODE", nodeId: null });
  }, [dispatch]);

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={state.nodes}
        edges={state.edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onPaneClick={onPaneClick}
        fitView
        defaultEdgeOptions={{ type: "account" }}
      >
        <Background />
        <Controls />
        <MiniMap
          nodeColor={() => "hsl(var(--primary))"}
          className="!bg-muted"
        />
      </ReactFlow>
    </div>
  );
}
