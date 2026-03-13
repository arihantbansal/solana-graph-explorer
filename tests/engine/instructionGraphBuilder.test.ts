import { describe, it, expect } from "vitest";
import { buildInstructionGraphs } from "@/engine/instructionGraphBuilder";
import type { ParsedTransaction } from "@/types/transaction";
import type { Idl } from "@/types/idl";

function makeTx(overrides: Partial<ParsedTransaction> = {}): ParsedTransaction {
  return {
    signature: "test-sig",
    slot: 100,
    blockTime: 1700000000,
    err: null,
    fee: 5000,
    accountKeys: ["Alice111", "Bob2222", "Program1"],
    instructions: [],
    innerInstructions: [],
    logMessages: [],
    preBalances: [],
    postBalances: [],
    preTokenBalances: [],
    postTokenBalances: [],
    ...overrides,
  };
}

const mockIdl: Idl = {
  metadata: { name: "test_program", version: "0.1.0", spec: "0.1.0" },
  instructions: [
    {
      name: "transfer",
      discriminator: [10, 20, 30, 40, 50, 60, 70, 80],
      accounts: [
        { name: "from", writable: true, signer: true },
        { name: "to", writable: true },
        { name: "authority", signer: true },
      ],
      args: [{ name: "amount", type: "u64" }],
    },
  ],
  accounts: [],
  types: [],
};

describe("buildInstructionGraphs", () => {
  it("creates nodes for each account in an instruction, excluding program IDs", () => {
    const tx = makeTx({
      instructions: [
        {
          programId: "Program1",
          accounts: ["Alice111", "Bob2222", "Program1"],
          data: "test-data",
          decoded: {
            instructionName: "transfer",
            args: { amount: "1000" },
            programName: "test_program",
          },
        },
      ],
    });

    const idls = new Map<string, Idl>([["Program1", mockIdl]]);
    const result = buildInstructionGraphs(tx, idls);

    // 1 cluster node + 2 account nodes (Program1 excluded) + 1 args node = 4 nodes
    expect(result.nodes.length).toBe(4);
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0].label).toContain("transfer");
    expect(result.clusters[0].label).toContain("test_program");
    // Program ID should not be an account node
    const accountNodes = result.nodes.filter((n) => n.type === "account");
    expect(accountNodes).toHaveLength(2);
    expect(accountNodes.map(n => n.data.address)).not.toContain("Program1");
  });

  it("skips ComputeBudget instructions", () => {
    const tx = makeTx({
      instructions: [
        {
          programId: "ComputeBudget111111111111111111111111111111",
          accounts: [],
          data: "some-data",
        },
        {
          programId: "Program1",
          accounts: ["Alice111"],
          data: "other-data",
        },
      ],
    });

    const result = buildInstructionGraphs(tx, new Map());
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0].instructionIndex).toBe(1);
  });

  it("spaces clusters vertically", () => {
    const tx = makeTx({
      instructions: [
        {
          programId: "Program1",
          accounts: ["Alice111"],
          data: "data1",
        },
        {
          programId: "Program1",
          accounts: ["Bob2222"],
          data: "data2",
        },
      ],
    });

    const result = buildInstructionGraphs(tx, new Map());
    expect(result.clusters).toHaveLength(2);

    const clusterNodes = result.nodes.filter((n) => n.type === "ixCluster");
    expect(clusterNodes).toHaveLength(2);
    expect(clusterNodes[1].position.y).toBeGreaterThan(clusterNodes[0].position.y);
  });

  it("creates args node when decoded args present", () => {
    const tx = makeTx({
      instructions: [
        {
          programId: "Program1",
          accounts: ["Alice111"],
          data: "data1",
          decoded: {
            instructionName: "transfer",
            args: { amount: "500", memo: "test" },
            programName: "test_program",
          },
        },
      ],
    });

    const result = buildInstructionGraphs(tx, new Map());
    const argsNodes = result.nodes.filter((n) => n.type === "txArgs");
    expect(argsNodes).toHaveLength(1);
    expect(argsNodes[0].data.args).toEqual({
      amount: "500",
      memo: "test",
    });
  });

  it("does not create args node when no decoded args", () => {
    const tx = makeTx({
      instructions: [
        {
          programId: "Program1",
          accounts: ["Alice111"],
          data: "data1",
        },
      ],
    });

    const result = buildInstructionGraphs(tx, new Map());
    const argsNodes = result.nodes.filter((n) => n.type === "txArgs");
    expect(argsNodes).toHaveLength(0);
  });

  it("uses IDL account definitions for node labels", () => {
    const tx = makeTx({
      instructions: [
        {
          programId: "Program1",
          accounts: ["Alice111", "Bob2222", "Charlie3"],
          data: "data1",
          decoded: {
            instructionName: "transfer",
            args: {},
            programName: "test_program",
          },
        },
      ],
    });

    const idls = new Map<string, Idl>([["Program1", mockIdl]]);
    const result = buildInstructionGraphs(tx, idls);

    const accountNodes = result.nodes.filter((n) => n.type === "account");
    expect(accountNodes).toHaveLength(3);
    expect(accountNodes[0].data.ixAccountLabel).toBe("from");
    expect(accountNodes[1].data.ixAccountLabel).toBe("to");
    expect(accountNodes[2].data.ixAccountLabel).toBe("authority");
  });

  it("marks signer and writable from IDL", () => {
    const tx = makeTx({
      instructions: [
        {
          programId: "Program1",
          accounts: ["Alice111", "Bob2222", "Charlie3"],
          data: "data1",
          decoded: {
            instructionName: "transfer",
            args: {},
            programName: "test_program",
          },
        },
      ],
    });

    const idls = new Map<string, Idl>([["Program1", mockIdl]]);
    const result = buildInstructionGraphs(tx, idls);

    const accountNodes = result.nodes.filter((n) => n.type === "account");
    expect(accountNodes[0].data.isSigner).toBe(true);
    expect(accountNodes[0].data.isWritable).toBe(true);
    expect(accountNodes[1].data.isSigner).toBe(false);
    expect(accountNodes[1].data.isWritable).toBe(true);
    expect(accountNodes[2].data.isSigner).toBe(true);
    expect(accountNodes[2].data.isWritable).toBe(false);
  });

  it("handles instructions without IDL", () => {
    const tx = makeTx({
      instructions: [
        {
          programId: "UnknownProgram",
          accounts: ["Alice111", "Bob2222"],
          data: "data1",
        },
      ],
    });

    const result = buildInstructionGraphs(tx, new Map());
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0].label).toContain("Unknown");

    const accountNodes = result.nodes.filter((n) => n.type === "account");
    expect(accountNodes).toHaveLength(2);
    expect(accountNodes[0].data.ixAccountLabel).toBe("Account 0");
    expect(accountNodes[1].data.ixAccountLabel).toBe("Account 1");
  });

  it("sets parentId on child nodes", () => {
    const tx = makeTx({
      instructions: [
        {
          programId: "Program1",
          accounts: ["Alice111"],
          data: "data1",
        },
      ],
    });

    const result = buildInstructionGraphs(tx, new Map());
    const accountNodes = result.nodes.filter((n) => n.type === "account");
    expect(accountNodes[0].parentId).toBe("cluster-0");
    expect(accountNodes[0].extent).toBe("parent");
  });

  it("produces account-type nodes instead of txAccount", () => {
    const tx = makeTx({
      instructions: [
        {
          programId: "Program1",
          accounts: ["Alice111"],
          data: "data1",
        },
      ],
    });

    const result = buildInstructionGraphs(tx, new Map());
    const accountNodes = result.nodes.filter((n) => n.type === "account");
    expect(accountNodes).toHaveLength(1);
    expect(accountNodes[0].data.address).toBe("Alice111");
    expect(accountNodes[0].data.isLoading).toBe(true);
    expect(accountNodes[0].data.isExpanded).toBe(false);
    expect(result.nodes.filter((n) => n.type === "txAccount")).toHaveLength(0);
  });

  it("merges inner instruction accounts into parent cluster", () => {
    const tx = makeTx({
      instructions: [
        {
          programId: "Program1",
          accounts: ["Alice111"],
          data: "data1",
        },
      ],
      innerInstructions: [
        {
          index: 0,
          instructions: [
            {
              programId: "Program2",
              accounts: ["Bob2222", "Alice111"], // Alice is shared
              data: "inner-data",
            },
          ],
        },
      ],
    });

    const result = buildInstructionGraphs(tx, new Map());
    // Only 1 cluster (top-level), no separate inner cluster
    expect(result.clusters).toHaveLength(1);

    // Alice + Bob = 2 unique accounts, deduped (Program1 and Program2 excluded)
    const accountNodes = result.nodes.filter((n) => n.type === "account");
    expect(accountNodes).toHaveLength(2);

    // Inner instruction metadata tracks which nodes it uses (excludes program IDs)
    const cluster = result.clusters[0];
    expect(cluster.innerInstructions).toHaveLength(1);
    expect(cluster.innerInstructions[0].nodeIds.has("cluster-0-Bob2222")).toBe(true);
    expect(cluster.innerInstructions[0].nodeIds.has("cluster-0-Alice111")).toBe(true);
    // Program IDs should be excluded from inner nodeIds
    expect(cluster.innerInstructions[0].nodeIds.has("cluster-0-Program2")).toBe(false);
  });

  it("skips ComputeBudget inner instructions", () => {
    const tx = makeTx({
      instructions: [
        {
          programId: "Program1",
          accounts: ["Alice111"],
          data: "data1",
        },
      ],
      innerInstructions: [
        {
          index: 0,
          instructions: [
            {
              programId: "ComputeBudget111111111111111111111111111111",
              accounts: [],
              data: "cb-data",
            },
            {
              programId: "Program2",
              accounts: ["Bob2222"],
              data: "inner-data",
            },
          ],
        },
      ],
    });

    const result = buildInstructionGraphs(tx, new Map());
    expect(result.clusters).toHaveLength(1);
    // Only 1 inner instruction (CB skipped)
    expect(result.clusters[0].innerInstructions).toHaveLength(1);
  });

  it("uses well-known program names", () => {
    const tx = makeTx({
      instructions: [
        {
          programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
          accounts: ["Alice111"],
          data: "data1",
        },
      ],
    });

    const result = buildInstructionGraphs(tx, new Map());
    expect(result.clusters[0].label).toContain("Token Program");
  });

  it("no separate inner clusters or CPI edges", () => {
    const tx = makeTx({
      instructions: [
        {
          programId: "Program1",
          accounts: ["Alice111"],
          data: "data1",
        },
      ],
      innerInstructions: [
        {
          index: 0,
          instructions: [
            {
              programId: "Program2",
              accounts: ["Bob2222"],
              data: "inner-data",
            },
          ],
        },
      ],
    });

    const result = buildInstructionGraphs(tx, new Map());
    // Only 1 ixCluster node (no inner cluster groups)
    const clusterNodes = result.nodes.filter((n) => n.type === "ixCluster");
    expect(clusterNodes).toHaveLength(1);
    // No CPI edges
    const cpiEdges = result.edges.filter((e) => e.label === "CPI");
    expect(cpiEdges).toHaveLength(0);
  });

  it("excludes program ID accounts from display nodes", () => {
    const tx = makeTx({
      instructions: [
        {
          programId: "Program1",
          accounts: ["Alice111", "Program1", "Bob2222"],
          data: "data1",
        },
      ],
    });

    const result = buildInstructionGraphs(tx, new Map());
    const accountNodes = result.nodes.filter((n) => n.type === "account");
    // Program1 should be excluded
    expect(accountNodes).toHaveLength(2);
    expect(accountNodes.map((n) => n.data.address)).toEqual(["Alice111", "Bob2222"]);
  });

  it("sets pdaSeeds on account nodes from IDL definitions", () => {
    const idlWithPda: Idl = {
      metadata: { name: "pda_program", version: "0.1.0", spec: "0.1.0" },
      instructions: [
        {
          name: "init",
          discriminator: [1, 2, 3, 4, 5, 6, 7, 8],
          accounts: [
            {
              name: "myAccount",
              writable: true,
              pda: {
                seeds: [
                  { kind: "const", value: [109, 121, 95, 115, 101, 101, 100] }, // "my_seed"
                  { kind: "account", path: "owner" },
                  { kind: "arg", path: "id" },
                ],
              },
            },
            { name: "owner", signer: true },
          ],
          args: [{ name: "id", type: "u64" }],
        },
      ],
      accounts: [],
      types: [],
    };

    const tx = makeTx({
      instructions: [
        {
          programId: "PdaProg1",
          accounts: ["Derived1", "Owner111"],
          data: "data1",
          decoded: {
            instructionName: "init",
            args: {},
            programName: "pda_program",
          },
        },
      ],
    });

    const idls = new Map<string, Idl>([["PdaProg1", idlWithPda]]);
    const result = buildInstructionGraphs(tx, idls);

    const accountNodes = result.nodes.filter((n) => n.type === "account");
    expect(accountNodes[0].data.pdaSeeds).toBe('"my_seed", owner, arg:id');
    expect(accountNodes[1].data.pdaSeeds).toBeUndefined();
  });

  it("flattens nested account structs in IDL", () => {
    const nestedIdl: Idl = {
      metadata: { name: "nested_program", version: "0.1.0", spec: "0.1.0" },
      instructions: [
        {
          name: "distribute",
          discriminator: [10, 20, 30, 40, 50, 60, 70, 80],
          accounts: [
            { name: "recipient", writable: true },
            {
              name: "common",
              accounts: [
                { name: "payer", writable: true, signer: true },
                { name: "authority", signer: true },
                { name: "systemProgram" },
              ],
            },
            { name: "extraAccount" },
          ],
          args: [],
        },
      ],
      accounts: [],
      types: [],
    };

    const tx = makeTx({
      instructions: [
        {
          programId: "NestedProg",
          // 5 accounts: recipient, payer, authority, systemProgram, extraAccount
          // "common" is NOT an account — it's a struct grouping
          accounts: ["Recip1", "Payer1", "Auth1", "SysProg1", "Extra1"],
          data: "data1",
          decoded: {
            instructionName: "distribute",
            args: {},
            programName: "nested_program",
          },
        },
      ],
    });

    const idls = new Map<string, Idl>([["NestedProg", nestedIdl]]);
    const result = buildInstructionGraphs(tx, idls);

    const accountNodes = result.nodes.filter((n) => n.type === "account");
    expect(accountNodes).toHaveLength(5);
    expect(accountNodes[0].data.ixAccountLabel).toBe("recipient");
    expect(accountNodes[1].data.ixAccountLabel).toBe("common.payer");
    expect(accountNodes[2].data.ixAccountLabel).toBe("common.authority");
    expect(accountNodes[3].data.ixAccountLabel).toBe("common.systemProgram");
    expect(accountNodes[4].data.ixAccountLabel).toBe("extraAccount");

    // Check signer/writable propagated correctly
    expect(accountNodes[0].data.isWritable).toBe(true);
    expect(accountNodes[0].data.isSigner).toBe(false);
    expect(accountNodes[1].data.isSigner).toBe(true);
    expect(accountNodes[1].data.isWritable).toBe(true);
    expect(accountNodes[2].data.isSigner).toBe(true);
  });

  it("includes instructionDetail on cluster node data", () => {
    const tx = makeTx({
      instructions: [
        {
          programId: "Program1",
          accounts: ["Alice111", "Bob2222"],
          data: "test-data",
          decoded: {
            instructionName: "transfer",
            args: { amount: "500" },
            programName: "test_program",
          },
        },
      ],
    });

    const idls = new Map<string, Idl>([["Program1", mockIdl]]);
    const result = buildInstructionGraphs(tx, idls);

    const clusterNode = result.nodes.find((n) => n.type === "ixCluster");
    expect(clusterNode).toBeDefined();
    const detail = clusterNode!.data.instructionDetail;
    expect(detail).toBeDefined();
    expect(detail.instructionName).toBe("transfer");
    expect(detail.programId).toBe("Program1");
    expect(detail.programName).toBe("test_program");
    expect(detail.rawData).toBe("test-data");
    expect(detail.args).toEqual({ amount: "500" });
    // Accounts should exclude Program1
    expect(detail.accounts.map((a: { address: string }) => a.address)).toEqual(["Alice111", "Bob2222"]);
    expect(detail.accounts[0].name).toBe("from");
    expect(detail.accounts[0].isSigner).toBe(true);
    expect(detail.accounts[0].isWritable).toBe(true);
  });
});
