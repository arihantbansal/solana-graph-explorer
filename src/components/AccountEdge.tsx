import {
  getBezierPath,
  EdgeLabelRenderer,
  type EdgeProps,
} from "@xyflow/react";
import type { AccountEdge } from "@/types/graph";
import type { RelationshipType } from "@/types/relationships";

function getEdgeStyle(relationshipType: RelationshipType): {
  strokeDasharray?: string;
  stroke: string;
} {
  switch (relationshipType) {
    case "has_one":
      return { stroke: "#6b7280" }; // solid gray
    case "pda_seed":
      return { stroke: "#8b5cf6", strokeDasharray: "5 5" }; // dashed purple
    case "user_defined":
      return { stroke: "#f59e0b", strokeDasharray: "2 2" }; // dotted amber
    case "token":
      return { stroke: "#10b981" }; // solid emerald
  }
}

export function AccountEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: EdgeProps<AccountEdge>) {
  const relationshipType = data?.relationshipType ?? "has_one";
  const label = data?.label ?? "";

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const style = getEdgeStyle(relationshipType);

  return (
    <>
      <path
        id={id}
        className="react-flow__edge-path"
        d={edgePath}
        style={{
          ...style,
          strokeWidth: 2,
          fill: "none",
        }}
        markerEnd={markerEnd}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            className="absolute text-[10px] bg-background/90 px-1 py-0.5 rounded border border-border text-muted-foreground pointer-events-all nodrag nopan"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
