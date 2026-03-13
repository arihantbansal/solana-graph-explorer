/**
 * Layout utilities for the graph canvas.
 *
 * Initial placement uses a radial layout, then collision resolution
 * (based on the React Flow node-collisions example) pushes overlapping
 * nodes apart along the axis of least overlap.
 */
import type { Node } from "@xyflow/react";
import type { AccountNode } from "@/types/graph";

const NODE_WIDTH = 280;
const NODE_HEIGHT = 500;
const BASE_RADIUS = 450;
const RADIUS_PER_CHILD = 80;

export interface NodeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// Collision resolution (React Flow recommended pattern)
// ---------------------------------------------------------------------------

export type CollisionOptions = {
  maxIterations?: number;
  /** Minimum overlap in px before we consider it a collision */
  overlapThreshold?: number;
  /** Extra margin around each node */
  margin?: number;
};

type Box = {
  x: number;
  y: number;
  width: number;
  height: number;
  moved: boolean;
  node: Node<AccountNode["data"]>;
};

function getBoxes(nodes: Node<AccountNode["data"]>[], margin: number): Box[] {
  return nodes.map((node) => ({
    x: node.position.x - margin,
    y: node.position.y - margin,
    width: (node.width ?? node.measured?.width ?? NODE_WIDTH) + margin * 2,
    height: (node.height ?? node.measured?.height ?? NODE_HEIGHT) + margin * 2,
    node,
    moved: false,
  }));
}

/**
 * Resolve collisions between nodes by pushing overlapping pairs apart
 * along the axis of least overlap. Returns a new nodes array with
 * updated positions (only changed nodes are cloned).
 *
 * Based on: https://reactflow.dev/examples/layout/node-collisions
 */
export function resolveCollisions(
  nodes: Node<AccountNode["data"]>[],
  {
    maxIterations = 100,
    overlapThreshold = 0.5,
    margin = 25,
  }: CollisionOptions = {},
): Node<AccountNode["data"]>[] {
  const boxes = getBoxes(nodes, margin);

  for (let iter = 0; iter <= maxIterations; iter++) {
    let moved = false;

    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const A = boxes[i];
        const B = boxes[j];

        const centerAX = A.x + A.width * 0.5;
        const centerAY = A.y + A.height * 0.5;
        const centerBX = B.x + B.width * 0.5;
        const centerBY = B.y + B.height * 0.5;

        const dx = centerAX - centerBX;
        const dy = centerAY - centerBY;

        // Penetration depth on each axis
        const px = (A.width + B.width) * 0.5 - Math.abs(dx);
        const py = (A.height + B.height) * 0.5 - Math.abs(dy);

        if (px > overlapThreshold && py > overlapThreshold) {
          A.moved = B.moved = moved = true;

          // Push apart along the axis with least overlap
          if (px < py) {
            const sx = dx > 0 ? 1 : -1;
            const move = (px / 2) * sx;
            A.x += move;
            B.x -= move;
          } else {
            const sy = dy > 0 ? 1 : -1;
            const move = (py / 2) * sy;
            A.y += move;
            B.y -= move;
          }
        }
      }
    }

    if (!moved) break;
  }

  return boxes.map((box) => {
    if (box.moved) {
      return {
        ...box.node,
        position: { x: box.x + margin, y: box.y + margin },
      };
    }
    return box.node;
  });
}

// ---------------------------------------------------------------------------
// Initial radial placement for new child nodes
// ---------------------------------------------------------------------------

export function circularLayout(
  centerX: number,
  centerY: number,
  count: number,
  existingRects: NodeRect[] = [],
): { x: number; y: number }[] {
  if (count === 0) return [];

  const radius =
    count === 1
      ? NODE_WIDTH + 80
      : BASE_RADIUS + count * RADIUS_PER_CHILD;

  const positions: { x: number; y: number }[] = [];

  if (count === 1) {
    positions.push({ x: centerX + radius, y: centerY - NODE_HEIGHT / 2 });
  } else if (count === 2) {
    positions.push({
      x: centerX + radius * 0.7 - NODE_WIDTH / 2,
      y: centerY - radius * 0.5 - NODE_HEIGHT / 2,
    });
    positions.push({
      x: centerX - radius * 0.7 - NODE_WIDTH / 2,
      y: centerY + radius * 0.5 - NODE_HEIGHT / 2,
    });
  } else {
    const angleStep = (2 * Math.PI) / count;
    const startAngle = -((count - 1) * angleStep) / 2;
    for (let i = 0; i < count; i++) {
      const angle = startAngle + i * angleStep;
      positions.push({
        x: centerX + Math.cos(angle) * radius - NODE_WIDTH / 2,
        y: centerY + Math.sin(angle) * radius - NODE_HEIGHT / 2,
      });
    }
  }

  // Quick pass: push new positions away from existing immovable rects
  const PADDING = 50;
  for (let iter = 0; iter < 40; iter++) {
    let moved = false;
    for (const pos of positions) {
      for (const existing of existingRects) {
        const ax = pos.x, ay = pos.y, aw = NODE_WIDTH, ah = NODE_HEIGHT;
        const bx = existing.x, by = existing.y, bw = existing.width, bh = existing.height;

        const px = (aw + bw) / 2 + PADDING - Math.abs((ax + aw / 2) - (bx + bw / 2));
        const py = (ah + bh) / 2 + PADDING - Math.abs((ay + ah / 2) - (by + bh / 2));

        if (px > 0 && py > 0) {
          const dx = (ax + aw / 2) - (bx + bw / 2);
          const dy = (ay + ah / 2) - (by + bh / 2);
          if (px < py) {
            pos.x += (dx > 0 ? 1 : -1) * px;
          } else {
            pos.y += (dy > 0 ? 1 : -1) * py;
          }
          moved = true;
        }
      }
    }
    // Also push new nodes away from each other
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const a = positions[i], b = positions[j];
        const px = NODE_WIDTH + PADDING - Math.abs((a.x + NODE_WIDTH / 2) - (b.x + NODE_WIDTH / 2));
        const py = NODE_HEIGHT + PADDING - Math.abs((a.y + NODE_HEIGHT / 2) - (b.y + NODE_HEIGHT / 2));
        if (px > 0 && py > 0) {
          const dx = (a.x + NODE_WIDTH / 2) - (b.x + NODE_WIDTH / 2);
          const dy = (a.y + NODE_HEIGHT / 2) - (b.y + NODE_HEIGHT / 2);
          if (px < py) {
            const move = px / 2 * (dx > 0 ? 1 : -1);
            a.x += move;
            b.x -= move;
          } else {
            const move = py / 2 * (dy > 0 ? 1 : -1);
            a.y += move;
            b.y -= move;
          }
          moved = true;
        }
      }
    }
    if (!moved) break;
  }

  return positions;
}
