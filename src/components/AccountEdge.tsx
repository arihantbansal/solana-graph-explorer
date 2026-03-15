import { useState, useCallback } from "react";
import {
  getBezierPath,
  EdgeLabelRenderer,
  useInternalNode,
  Position,
  type EdgeProps,
} from "@xyflow/react";
import type { AccountEdge } from "@/types/graph";
import type { RelationshipType } from "@/types/relationships";
import { useSettings } from "@/contexts/SettingsContext";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { pickHandleSides, getHandlePosition, type Side } from "@/utils/edgeRouting";

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

const sideToPosition: Record<Side, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
};

export function AccountEdgeComponent({
  id,
  source,
  target,
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
  const ruleId = data?.ruleId;
  const pdaRule = data?.pdaRule;

  const { relationshipRules, addRelationshipRule } = useSettings();
  const [showActions, setShowActions] = useState(false);

  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);

  // Check if this edge's rule is already saved
  const isRemembered = ruleId
    ? relationshipRules.some((r) => r.id === ruleId)
    : pdaRule
      ? relationshipRules.some((r) => r.id === pdaRule.id)
      : false;

  const handleRemember = useCallback(() => {
    if (!pdaRule) return;
    addRelationshipRule(pdaRule);
  }, [pdaRule, addRelationshipRule]);

  // Smart routing: use node positions to pick optimal handle sides
  let edgePath: string;
  let labelX: number;
  let labelY: number;

  const hasMeasuredNodes =
    sourceNode?.internals.positionAbsolute &&
    targetNode?.internals.positionAbsolute &&
    sourceNode.measured.width &&
    sourceNode.measured.height &&
    targetNode.measured.width &&
    targetNode.measured.height;

  if (hasMeasuredNodes) {
    const sourceBox = {
      x: sourceNode.internals.positionAbsolute.x,
      y: sourceNode.internals.positionAbsolute.y,
      width: sourceNode.measured.width!,
      height: sourceNode.measured.height!,
    };
    const targetBox = {
      x: targetNode.internals.positionAbsolute.x,
      y: targetNode.internals.positionAbsolute.y,
      width: targetNode.measured.width!,
      height: targetNode.measured.height!,
    };

    const { sourceSide, targetSide } = pickHandleSides(sourceBox, targetBox);
    const sourceAnchor = getHandlePosition(sourceBox, sourceSide);
    const targetAnchor = getHandlePosition(targetBox, targetSide);

    [edgePath, labelX, labelY] = getBezierPath({
      sourceX: sourceAnchor.x,
      sourceY: sourceAnchor.y,
      sourcePosition: sideToPosition[sourceSide],
      targetX: targetAnchor.x,
      targetY: targetAnchor.y,
      targetPosition: sideToPosition[targetSide],
    });
  } else {
    // Fallback before nodes are measured
    [edgePath, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });
  }

  const style = getEdgeStyle(relationshipType);
  const canRemember = !!pdaRule;

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
            className="absolute text-[10px] bg-background px-1 py-0.5 rounded border border-border text-muted-foreground dark:text-foreground/70 pointer-events-all nodrag nopan flex items-center gap-1"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            }}
            onMouseEnter={() => setShowActions(true)}
            onMouseLeave={() => setShowActions(false)}
          >
            <span>{label}</span>
            {canRemember && (showActions || isRemembered) && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemember();
                }}
                className={`shrink-0 ${isRemembered ? "text-amber-500" : "text-muted-foreground hover:text-amber-500"}`}
                title={
                  isRemembered
                    ? "Rule saved — will auto-derive for matching accounts"
                    : "Save as rule — auto-derive for all matching accounts"
                }
              >
                {isRemembered ? (
                  <BookmarkCheck className="size-3" />
                ) : (
                  <Bookmark className="size-3" />
                )}
              </button>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
