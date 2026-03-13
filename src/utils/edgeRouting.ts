export type Side = "top" | "right" | "bottom" | "left";

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Given source and target bounding boxes, pick which side of each node
 * the edge should exit/enter based on the angle between their centers.
 */
export function pickHandleSides(
  source: Box,
  target: Box,
): { sourceSide: Side; targetSide: Side } {
  const sx = source.x + source.width / 2;
  const sy = source.y + source.height / 2;
  const tx = target.x + target.width / 2;
  const ty = target.y + target.height / 2;

  // atan2 gives angle in radians; convert to degrees
  // Note: screen y-axis is inverted (down = positive)
  const angle = (Math.atan2(ty - sy, tx - sx) * 180) / Math.PI;

  if (angle >= -45 && angle < 45) {
    return { sourceSide: "right", targetSide: "left" };
  } else if (angle >= 45 && angle < 135) {
    return { sourceSide: "bottom", targetSide: "top" };
  } else if (angle >= -135 && angle < -45) {
    return { sourceSide: "top", targetSide: "bottom" };
  } else {
    // angle >= 135 || angle < -135
    return { sourceSide: "left", targetSide: "right" };
  }
}

/**
 * Returns the x,y anchor point at the center of the given side of a node box.
 */
export function getHandlePosition(
  box: Box,
  side: Side,
): { x: number; y: number } {
  switch (side) {
    case "top":
      return { x: box.x + box.width / 2, y: box.y };
    case "bottom":
      return { x: box.x + box.width / 2, y: box.y + box.height };
    case "left":
      return { x: box.x, y: box.y + box.height / 2 };
    case "right":
      return { x: box.x + box.width, y: box.y + box.height / 2 };
  }
}
