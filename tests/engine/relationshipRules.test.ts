import { describe, it, expect } from "vitest";
import { resolveSeedMappings } from "@/engine/relationshipRules";
import type { PdaRelationshipRule } from "@/types/relationships";
import type { AccountNodeData } from "@/types/graph";

function makeNodeData(overrides: Partial<AccountNodeData> = {}): AccountNodeData {
  return {
    address: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin",
    accountType: "KeyToAssetV0",
    programId: "hemjuPXBpKgYe3XjWMPRtuifABSYfg3trJj9FmiVDRi",
    isExpanded: false,
    isLoading: false,
    decodedData: {
      asset: "EK4pXzyCDy7kYjjRhVGnJZbch4kSbxGLkFy8qBAXeiHo",
      entityKey: "hello-world",
      dao: "DaoK1xH2RZ9gRp7WLzPGGfrZ9ikbFuQhbMNTNT1Ct6t7",
    },
    ...overrides,
  };
}

function makeRule(overrides: Partial<PdaRelationshipRule> = {}): PdaRelationshipRule {
  return {
    id: "test-rule",
    label: "recipient",
    sourceAccountType: "KeyToAssetV0",
    sourceProgram: "hemjuPXBpKgYe3XjWMPRtuifABSYfg3trJj9FmiVDRi",
    targetPdaName: "recipient",
    targetProgramId: "1azyuavdMyvsivtNxPoz6SucD18eDHeXzFCUPq5XU7w",
    seedMappings: [
      {
        seedIndex: 0,
        seed: { kind: "const", value: [114, 101, 99, 105, 112, 105, 101, 110, 116] }, // "recipient"
        source: { kind: "idl_const" },
      },
      {
        seedIndex: 1,
        seed: { kind: "account", path: "asset" },
        source: { kind: "field", fieldName: "asset" },
      },
    ],
    ...overrides,
  };
}

describe("resolveSeedMappings", () => {
  it("resolves idl_const seeds", () => {
    const rule = makeRule();
    const nodeData = makeNodeData();
    const result = resolveSeedMappings(rule, nodeData);

    expect(result).not.toBeNull();
    expect(result![0].seed.kind).toBe("const");
    expect(result![0].value).toBe("");
  });

  it("resolves field seeds from decodedData", () => {
    const rule = makeRule();
    const nodeData = makeNodeData();
    const result = resolveSeedMappings(rule, nodeData);

    expect(result).not.toBeNull();
    expect(result![1].value).toBe("EK4pXzyCDy7kYjjRhVGnJZbch4kSbxGLkFy8qBAXeiHo");
  });

  it("returns null when field is missing from decodedData", () => {
    const rule = makeRule({
      seedMappings: [
        {
          seedIndex: 0,
          seed: { kind: "account", path: "missing_field" },
          source: { kind: "field", fieldName: "nonExistent" },
        },
      ],
    });
    const nodeData = makeNodeData();
    const result = resolveSeedMappings(rule, nodeData);

    expect(result).toBeNull();
  });

  it("returns null when decodedData is undefined", () => {
    const rule = makeRule({
      seedMappings: [
        {
          seedIndex: 0,
          seed: { kind: "account", path: "asset" },
          source: { kind: "field", fieldName: "asset" },
        },
      ],
    });
    const nodeData = makeNodeData({ decodedData: undefined });
    const result = resolveSeedMappings(rule, nodeData);

    expect(result).toBeNull();
  });

  it("resolves source_address seeds", () => {
    const rule = makeRule({
      seedMappings: [
        {
          seedIndex: 0,
          seed: { kind: "account", path: "source" },
          source: { kind: "source_address" },
        },
      ],
    });
    const nodeData = makeNodeData();
    const result = resolveSeedMappings(rule, nodeData);

    expect(result).not.toBeNull();
    expect(result![0].value).toBe(nodeData.address);
  });

  it("resolves const seeds with encoding", () => {
    const rule = makeRule({
      seedMappings: [
        {
          seedIndex: 0,
          seed: { kind: "arg", path: "tag" },
          source: { kind: "const", value: "my-tag", encoding: "utf8" },
        },
      ],
    });
    const nodeData = makeNodeData();
    const result = resolveSeedMappings(rule, nodeData);

    expect(result).not.toBeNull();
    expect(result![0].value).toBe("my-tag");
    expect(result![0].bufferEncoding).toBe("utf8");
  });

  it("resolves a multi-seed rule with mixed sources", () => {
    const rule = makeRule({
      seedMappings: [
        {
          seedIndex: 0,
          seed: { kind: "const", value: "prefix" },
          source: { kind: "idl_const" },
        },
        {
          seedIndex: 1,
          seed: { kind: "account", path: "source" },
          source: { kind: "source_address" },
        },
        {
          seedIndex: 2,
          seed: { kind: "account", path: "asset" },
          source: { kind: "field", fieldName: "asset" },
        },
        {
          seedIndex: 3,
          seed: { kind: "arg", path: "tag" },
          source: { kind: "const", value: "hello", encoding: "utf8" },
        },
      ],
    });
    const nodeData = makeNodeData();
    const result = resolveSeedMappings(rule, nodeData);

    expect(result).not.toBeNull();
    expect(result).toHaveLength(4);
    expect(result![0].value).toBe(""); // const seed
    expect(result![1].value).toBe(nodeData.address); // source_address
    expect(result![2].value).toBe("EK4pXzyCDy7kYjjRhVGnJZbch4kSbxGLkFy8qBAXeiHo"); // field
    expect(result![3].value).toBe("hello"); // const
    expect(result![3].bufferEncoding).toBe("utf8");
  });

  it("handles empty seedMappings", () => {
    const rule = makeRule({ seedMappings: [] });
    const nodeData = makeNodeData();
    const result = resolveSeedMappings(rule, nodeData);

    expect(result).not.toBeNull();
    expect(result).toHaveLength(0);
  });
});
