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
import { useSettings } from "@/contexts/SettingsContext";
import { AccountNodeComponent } from "@/components/AccountNode";
import { AccountEdgeComponent } from "@/components/AccountEdge";
import { expandAccount } from "@/engine/expandAccount";
import type { ProgramEntry } from "@/types/pdaExplorer";

// MUST be defined outside component per React Flow requirement
const nodeTypes = {
  account: AccountNodeComponent,
};

const edgeTypes = {
  account: AccountEdgeComponent,
};

export function GraphCanvas() {
  const { state, dispatch } = useGraph();
  const { rpcEndpoint, saveProgram } = useSettings();

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
    (_event, node) => {
      if (node.data.isExpanded || node.data.isLoading) return;
      const existingIds = new Set(state.nodes.map((n) => n.id));
      expandAccount(
        node.id,
        node.position,
        rpcEndpoint,
        existingIds,
        dispatch,
        {
          onIdlFetched: (programId, idl) => {
            const entry: ProgramEntry = {
              programId,
              programName: idl.metadata?.name ?? programId,
              idlFetchedAt: Date.now(),
              idl,
            };
            saveProgram(entry);
          },
        },
      );
    },
    [state.nodes, rpcEndpoint, dispatch, saveProgram],
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
