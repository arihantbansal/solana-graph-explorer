/**
 * Convert a string (typically a program ID) into a deterministic hue value (0-359).
 * Used for consistent color-coding of accounts by their owning program.
 */
export function hashToHue(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}
