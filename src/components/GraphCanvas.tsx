import { useCallback, useRef, useEffect } from "react";
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
import { ColorLegend } from "@/components/ColorLegend";
import { expandAccount } from "@/engine/expandAccount";
import { resolveCollisions, type NodeRect } from "@/utils/layout";
import { makeIdlFetchedHandler } from "@/utils/programSaver";

// MUST be defined outside component per React Flow requirement
const nodeTypes = {
  account: AccountNodeComponent,
};

const edgeTypes = {
  account: AccountEdgeComponent,
};

export function GraphCanvas() {
  const { state, dispatch } = useGraph();
  const { rpcEndpoint, saveProgram, collapsedAddresses, expansionDepth } = useSettings();

  // Track which nodes we've already resolved collisions for (by their measured dimension signature)
  const resolvedRef = useRef(new Set<string>());

  // After React Flow measures nodes, resolve any overlaps using actual dimensions
  useEffect(() => {
    // Check if any node was recently measured (new measurement we haven't processed)
    const newlyMeasured = state.nodes.filter((n) => {
      if (!n.measured?.width || !n.measured?.height) return false;
      const sig = `${n.id}:${n.measured.width}:${n.measured.height}`;
      return !resolvedRef.current.has(sig);
    });

    if (newlyMeasured.length === 0) return;

    // Mark all current measurements as seen
    for (const n of state.nodes) {
      if (n.measured?.width && n.measured?.height) {
        resolvedRef.current.add(`${n.id}:${n.measured.width}:${n.measured.height}`);
      }
    }

    // Only resolve if we have at least 2 measured nodes
    const measuredNodes = state.nodes.filter(
      (n) => n.measured?.width && n.measured?.height,
    );
    if (measuredNodes.length < 2) return;

    const resolved = resolveCollisions(measuredNodes, {
      maxIterations: 100,
      overlapThreshold: 0.5,
      margin: 25,
    });

    // Check if anything actually moved
    let anyMoved = false;
    for (let i = 0; i < resolved.length; i++) {
      const orig = measuredNodes[i];
      const res = resolved[i];
      if (
        Math.abs(res.position.x - orig.position.x) > 2 ||
        Math.abs(res.position.y - orig.position.y) > 2
      ) {
        anyMoved = true;
        break;
      }
    }
    if (!anyMoved) return;

    // Build a map of resolved positions
    const posMap = new Map<string, { x: number; y: number }>();
    for (const n of resolved) {
      posMap.set(n.id, n.position);
    }

    const updated = state.nodes.map((n) => {
      const pos = posMap.get(n.id);
      if (!pos) return n;
      if (pos.x === n.position.x && pos.y === n.position.y) return n;
      return { ...n, position: pos };
    });

    dispatch({ type: "SET_NODES", nodes: updated });
  }, [state.nodes, dispatch]);

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
      const existingRects: NodeRect[] = state.nodes.map((n) => ({
        x: n.position.x,
        y: n.position.y,
        width: n.measured?.width ?? 280,
        height: n.measured?.height ?? 500,
      }));
      expandAccount({
        address: node.id,
        sourcePosition: node.position,
        rpcUrl: rpcEndpoint,
        existingNodeIds: existingIds,
        dispatch,
        options: {
          onIdlFetched: makeIdlFetchedHandler(saveProgram),
          collapsedAddresses: new Set(collapsedAddresses),
          depth: expansionDepth,
        },
        existingRects,
      });
    },
    [state.nodes, rpcEndpoint, dispatch, saveProgram, collapsedAddresses, expansionDepth],
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
        <ColorLegend />
      </ReactFlow>
    </div>
  );
}
