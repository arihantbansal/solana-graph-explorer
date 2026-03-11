/**
 * Circular placement of expanded nodes around a parent.
 */
export function circularLayout(
  centerX: number,
  centerY: number,
  count: number,
  radius = 250,
): { x: number; y: number }[] {
  if (count === 0) return [];
  if (count === 1) return [{ x: centerX + radius, y: centerY }];

  const positions: { x: number; y: number }[] = [];
  const angleStep = (2 * Math.PI) / count;

  for (let i = 0; i < count; i++) {
    const angle = angleStep * i - Math.PI / 2; // start from top
    positions.push({
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    });
  }

  return positions;
}
