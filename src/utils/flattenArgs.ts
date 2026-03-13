/**
 * Flatten a nested args object into dot-notation key-value pairs.
 * Leaf values are kept as-is (string, number, bigint, boolean, Uint8Array, null).
 * Plain objects are recursed into with dotted keys.
 * Arrays are kept as leaf values.
 */
export function flattenArgs(
  obj: Record<string, unknown>,
  prefix = "",
): Array<[string, unknown]> {
  const result: Array<[string, unknown]> = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      !(value instanceof Uint8Array)
    ) {
      result.push(...flattenArgs(value as Record<string, unknown>, fullKey));
    } else {
      result.push([fullKey, value]);
    }
  }
  return result;
}

/** Format a leaf arg value for display. */
export function formatLeafValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Uint8Array) {
    if (value.length > 16) return `bytes(${value.length})`;
    return `[${Array.from(value).join(",")}]`;
  }
  if (Array.isArray(value)) {
    const str = JSON.stringify(value, (_, v) =>
      typeof v === "bigint" ? v.toString() : v,
    );
    return str.length > 60 ? str.slice(0, 56) + "..." : str;
  }
  return String(value);
}
