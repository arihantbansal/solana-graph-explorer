import type { TokenRelationship } from "@/types/relationships";

const TOKEN_FIELD_PATTERNS: Array<{
  pattern: RegExp;
  tokenType: "mint" | "token_account" | "asset";
}> = [
  { pattern: /^mint$/i, tokenType: "mint" },
  { pattern: /mint/i, tokenType: "mint" },
  { pattern: /token.?account/i, tokenType: "token_account" },
  { pattern: /token/i, tokenType: "token_account" },
  { pattern: /asset/i, tokenType: "asset" },
];

export function inferTokenRelationships(
  sourceAddress: string,
  decodedData: Record<string, unknown>
): TokenRelationship[] {
  const relationships: TokenRelationship[] = [];
  const seen = new Set<string>();

  for (const [fieldName, value] of Object.entries(decodedData)) {
    if (typeof value !== "string") {
      continue;
    }

    const match = matchTokenField(fieldName);
    if (!match) {
      continue;
    }

    const dedupKey = `${sourceAddress}:${value}:${match}`;
    if (seen.has(dedupKey)) {
      continue;
    }
    seen.add(dedupKey);

    relationships.push({
      sourceAddress,
      targetAddress: value,
      type: "token",
      label: `${match}: ${fieldName}`,
      tokenType: match,
    });
  }

  return relationships;
}

function matchTokenField(
  fieldName: string
): "mint" | "token_account" | "asset" | null {
  for (const { pattern, tokenType } of TOKEN_FIELD_PATTERNS) {
    if (pattern.test(fieldName)) {
      return tokenType;
    }
  }
  return null;
}
