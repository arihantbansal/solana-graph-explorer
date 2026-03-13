import type { Node, Edge } from "@xyflow/react";
import type { AccountNodeData } from "@/types/graph";
import type { ParsedInstruction, ParsedTransaction } from "@/types/transaction";
import type { Idl, IdlInstructionAccountDef, IdlPda } from "@/types/idl";
import { decodeInstruction } from "@/engine/instructionDecoder";
import { getWellKnownName, WELL_KNOWN_PROGRAM_IDS } from "@/utils/wellKnownPrograms";
import { shortenAddress } from "@/utils/format";
import { flattenArgs } from "@/utils/flattenArgs";

const COMPUTE_BUDGET_PROGRAM = "ComputeBudget111111111111111111111111111111";
const CLUSTER_PADDING = 50;
const NODE_WIDTH = 280;
const NODE_HEIGHT = 220;
const ARGS_ROW_HEIGHT = 20;
const ARGS_CHROME = 48; // padding + header + card border
const ARGS_GAP = 60;
const CLUSTER_GAP_Y = 140;
const ACCOUNT_GAP_X = 380;
const ACCOUNT_GAP_Y = 320;

/** Metadata about an inner (CPI) instruction within a top-level cluster. */
export interface InnerInstruction {
  label: string;
  /** Node IDs belonging to this inner instruction (account nodes within the parent cluster). */
  nodeIds: Set<string>;
}

export interface InstructionCluster {
  instructionIndex: number;
  clusterId: string;
  label: string;
  nodes: Node[];
  edges: Edge[];
  /** Inner instructions and which node IDs they use. */
  innerInstructions: InnerInstruction[];
}

/** Full detail of an instruction, attached to cluster nodes for the inspect panel. */
export interface InstructionDetail {
  instructionIndex: number;
  programId: string;
  programName: string;
  instructionName: string;
  accounts: Array<{
    index: number;
    name: string;
    address: string;
    isSigner: boolean;
    isWritable: boolean;
    pdaSeeds?: string;
  }>;
  args?: Record<string, unknown>;
  rawData: string;
}

/**
 * Flatten nested IDL account definitions into a flat list.
 * Anchor IDLs can have nested "accounts structs" (e.g. a "common" field
 * containing multiple accounts). These don't consume a slot in the
 * instruction's accounts array — only leaf accounts do.
 * Prefix names with the parent struct name for clarity (e.g. "common.payer").
 */
function flattenAccountDefs(
  defs: IdlInstructionAccountDef[],
  prefix = "",
): IdlInstructionAccountDef[] {
  const result: IdlInstructionAccountDef[] = [];
  for (const def of defs) {
    if (def.accounts && def.accounts.length > 0) {
      // This is a nested struct — recurse into its children
      const nestedPrefix = prefix ? `${prefix}.${def.name}` : def.name;
      result.push(...flattenAccountDefs(def.accounts, nestedPrefix));
    } else {
      // Leaf account — add with prefixed name
      const name = prefix ? `${prefix}.${def.name}` : def.name;
      result.push({ ...def, name });
    }
  }
  return result;
}

/**
 * Format PDA seeds from an IDL account definition for display.
 */
function formatPdaSeeds(pda: IdlPda): string {
  return pda.seeds.map(seed => {
    switch (seed.kind) {
      case "const": {
        if (typeof seed.value === "string") return `"${seed.value}"`;
        const bytes = seed.value as number[];
        try {
          const text = new TextDecoder().decode(new Uint8Array(bytes));
          if (/^[\x20-\x7E]+$/.test(text)) return `"${text}"`;
        } catch { /* fallthrough */ }
        return `0x${bytes.map(b => b.toString(16).padStart(2, '0')).join('')}`;
      }
      case "account": return seed.path;
      case "arg": return `arg:${seed.path}`;
    }
  }).join(", ");
}


/**
 * Find the IDL instruction definition that matches a parsed instruction.
 */
function findIdlInstruction(
  ix: ParsedInstruction,
  idl: Idl | undefined,
): { name: string; accountDefs: IdlInstructionAccountDef[] } | null {
  if (!idl) return null;
  const decoded = ix.decoded ?? decodeInstruction(ix, idl);
  if (!decoded) return null;

  const ixDef = idl.instructions.find(
    (def) => def.name === decoded.instructionName,
  );
  return ixDef
    ? { name: decoded.instructionName, accountDefs: flattenAccountDefs(ixDef.accounts) }
    : { name: decoded.instructionName, accountDefs: [] };
}

/**
 * Get display name for a program address.
 */
function getProgramDisplayName(programId: string, idl: Idl | undefined): string {
  return getWellKnownName(programId) ?? idl?.metadata?.name ?? shortenAddress(programId);
}

/**
 * Build React Flow nodes and edges for all instructions in a transaction.
 * Each top-level instruction gets one cluster. Inner instructions are tracked
 * as metadata (which accounts they touch) for legend-based filtering.
 */
export function buildInstructionGraphs(
  tx: ParsedTransaction,
  idls: Map<string, Idl>,
): { nodes: Node[]; edges: Edge[]; clusters: InstructionCluster[] } {
  const allNodes: Node[] = [];
  const allEdges: Edge[] = [];
  const clusters: InstructionCluster[] = [];

  let clusterY = 0;
  let ixDisplayIndex = 0;

  for (let i = 0; i < tx.instructions.length; i++) {
    const ix = tx.instructions[i];

    // Skip compute budget instructions
    if (ix.programId === COMPUTE_BUDGET_PROGRAM) continue;

    ixDisplayIndex++;
    const idl = idls.get(ix.programId);
    const clusterId = `cluster-${i}`;
    const ixInfo = findIdlInstruction(ix, idl);
    const ixName = ix.decoded?.instructionName ?? ixInfo?.name ?? "Unknown";
    const programName = ix.decoded?.programName ?? getProgramDisplayName(ix.programId, idl);
    const label = `#${ixDisplayIndex} ${ixName} (${programName})`;

    const clusterNodes: Node[] = [];
    const clusterEdges: Edge[] = [];

    // Collect ALL unique accounts: top-level + inner instructions
    // Track which accounts come from which inner instruction
    const innerSet = tx.innerInstructions.find((inner) => inner.index === i);
    const allAccounts: string[] = [...new Set(ix.accounts)];
    const accountDefs = ixInfo?.accountDefs ?? [];

    // Map from account address to the IDL label (only for top-level ix accounts)
    const accountLabels = new Map<string, string>();
    const accountSigners = new Set<string>();
    const accountWritables = new Set<string>();
    const accountPdaSeeds = new Map<string, string>();
    for (let j = 0; j < ix.accounts.length; j++) {
      const def = accountDefs[j];
      if (def?.name) accountLabels.set(ix.accounts[j], def.name);
      if (def?.signer) accountSigners.add(ix.accounts[j]);
      if (def?.writable) accountWritables.add(ix.accounts[j]);
      if (def?.pda) accountPdaSeeds.set(ix.accounts[j], formatPdaSeeds(def.pda));
    }

    // Process inner instructions: collect their accounts, build InnerInstruction metadata
    const innerInstructions: InnerInstruction[] = [];
    if (innerSet) {
      for (let k = 0; k < innerSet.instructions.length; k++) {
        const innerIx = innerSet.instructions[k];
        if (innerIx.programId === COMPUTE_BUDGET_PROGRAM) continue;

        const innerIdl = idls.get(innerIx.programId);
        const innerIxInfo = findIdlInstruction(innerIx, innerIdl);
        const innerIxName = innerIx.decoded?.instructionName ?? innerIxInfo?.name ?? "Unknown";
        const innerProgramName = innerIx.decoded?.programName ?? getProgramDisplayName(innerIx.programId, innerIdl);
        const innerLabel = `↳ ${innerIxName} (${innerProgramName})`;

        // Add inner accounts (dedup against existing)
        const innerAccountDefs = innerIxInfo?.accountDefs ?? [];
        for (let j = 0; j < innerIx.accounts.length; j++) {
          const addr = innerIx.accounts[j];
          if (!allAccounts.includes(addr)) {
            allAccounts.push(addr);
          }
          // Use inner IDL labels if top-level didn't label them
          const def = innerAccountDefs[j];
          if (def?.name && !accountLabels.has(addr)) {
            accountLabels.set(addr, def.name);
          }
          if (def?.signer) accountSigners.add(addr);
          if (def?.writable) accountWritables.add(addr);
          if (def?.pda && !accountPdaSeeds.has(addr)) accountPdaSeeds.set(addr, formatPdaSeeds(def.pda));
        }

        // Track which node IDs this inner ix touches (resolved after node creation)
        innerInstructions.push({
          label: innerLabel,
          nodeIds: new Set(innerIx.accounts.map((addr) => `${clusterId}-${addr}`)),
        });
      }
    }

    // Build set of program/sysvar addresses to exclude from display:
    // 1. Invoked programs (top-level + inner)
    // 2. Well-known programs/sysvars
    // 3. Accounts with a fixed `address` in the IDL (declared program refs)
    const excludedAddresses = new Set<string>();
    excludedAddresses.add(ix.programId);
    if (innerSet) {
      for (const innerIx of innerSet.instructions) {
        excludedAddresses.add(innerIx.programId);
      }
    }
    for (const addr of allAccounts) {
      if (WELL_KNOWN_PROGRAM_IDS.has(addr)) excludedAddresses.add(addr);
    }
    for (let j = 0; j < accountDefs.length && j < allAccounts.length; j++) {
      if (accountDefs[j]?.address) excludedAddresses.add(allAccounts[j]);
    }

    // Filter out program/sysvar accounts from display
    const displayAccounts = allAccounts.filter(addr => !excludedAddresses.has(addr));

    // Also exclude program IDs from inner instruction nodeIds
    for (const inner of innerInstructions) {
      for (const addr of excludedAddresses) {
        inner.nodeIds.delete(`${clusterId}-${addr}`);
      }
    }

    // Calculate cluster dimensions
    const accountCount = displayAccounts.length;
    const cols = Math.max(1, Math.ceil(Math.sqrt(accountCount)));
    const rows = Math.ceil(accountCount / cols);
    const hasArgs = ix.decoded?.args && Object.keys(ix.decoded.args).length > 0;
    const argsFieldCount = hasArgs ? flattenArgs(ix.decoded!.args!).length : 0;
    const estimatedArgsHeight = hasArgs ? ARGS_CHROME + argsFieldCount * ARGS_ROW_HEIGHT : 0;

    const contentWidth = cols * ACCOUNT_GAP_X + CLUSTER_PADDING * 2;
    const contentHeight =
      rows * ACCOUNT_GAP_Y +
      (hasArgs ? estimatedArgsHeight + ARGS_GAP : 0) +
      CLUSTER_PADDING * 2 +
      50;

    const clusterWidth = contentWidth;
    const clusterHeight = contentHeight;

    // Build instruction detail for inspect panel
    const detailAccounts: InstructionDetail["accounts"] = [];
    for (let j = 0; j < ix.accounts.length; j++) {
      const addr = ix.accounts[j];
      if (excludedAddresses.has(addr)) continue;
      const def = accountDefs[j];
      detailAccounts.push({
        index: j,
        name: def?.name ?? `Account ${j}`,
        address: addr,
        isSigner: accountSigners.has(addr),
        isWritable: accountWritables.has(addr),
        pdaSeeds: accountPdaSeeds.get(addr),
      });
    }

    const instructionDetail: InstructionDetail = {
      instructionIndex: ixDisplayIndex,
      programId: ix.programId,
      programName: programName,
      instructionName: ixName,
      accounts: detailAccounts,
      args: hasArgs && ix.decoded?.args ? ix.decoded.args : undefined,
      rawData: ix.data,
    };

    // Create cluster group node (custom ixCluster type)
    const clusterNode: Node = {
      id: clusterId,
      type: "ixCluster",
      position: { x: 0, y: clusterY },
      style: {
        width: clusterWidth,
        height: clusterHeight,
      },
      data: { label, instructionDetail },
    };
    clusterNodes.push(clusterNode);

    // Offset account nodes down if args are present (args go at top)
    const accountYOffset = hasArgs ? estimatedArgsHeight + ARGS_GAP : 0;

    // Create account nodes for display accounts (excluding program IDs)
    for (let j = 0; j < displayAccounts.length; j++) {
      const accountAddr = displayAccounts[j];
      const accountLabel = accountLabels.get(accountAddr) ?? getWellKnownName(accountAddr) ?? `Account ${j}`;
      const col = j % cols;
      const row = Math.floor(j / cols);

      const nodeId = `${clusterId}-${accountAddr}`;
      const pdaSeeds = accountPdaSeeds.get(accountAddr);
      const accountNode: Node = {
        id: nodeId,
        type: "account",
        position: {
          x: CLUSTER_PADDING + col * ACCOUNT_GAP_X,
          y: CLUSTER_PADDING + 30 + accountYOffset + row * ACCOUNT_GAP_Y,
        },
        parentId: clusterId,
        extent: "parent" as const,
        data: {
          address: accountAddr,
          isExpanded: false,
          isLoading: true,
          ixAccountLabel: accountLabel,
          isSigner: accountSigners.has(accountAddr),
          isWritable: accountWritables.has(accountAddr),
          ...(pdaSeeds ? { pdaSeeds } : {}),
        } satisfies AccountNodeData & Record<string, unknown>,
      };
      clusterNodes.push(accountNode);
    }

    // Create edges from top-level IDL relations (has_one etc.)
    for (let j = 0; j < ix.accounts.length; j++) {
      const def = accountDefs[j];
      if (def?.relations) {
        const sourceNodeId = `${clusterId}-${ix.accounts[j]}`;
        for (const relName of def.relations) {
          // Try exact match first, then suffix match for nested names (e.g. "rewards_escrow" → "common.rewards_escrow")
          let relIdx = accountDefs.findIndex((d) => d.name === relName);
          if (relIdx < 0) {
            relIdx = accountDefs.findIndex((d) => d.name.endsWith(`.${relName}`));
          }
          if (relIdx >= 0 && relIdx < ix.accounts.length) {
            const targetNodeId = `${clusterId}-${ix.accounts[relIdx]}`;
            clusterEdges.push({
              id: `${sourceNodeId}-rel-${targetNodeId}`,
              source: sourceNodeId,
              target: targetNodeId,
              label: relName,
              style: { stroke: "hsl(var(--muted-foreground))", strokeWidth: 1 },
            });
          }
        }
      }
    }

    // Create edges for PDA account seeds (account A's PDA uses account B as a seed)
    // Build name→address map for lookups
    const nameToAddr = new Map<string, string>();
    for (let j = 0; j < ix.accounts.length && j < accountDefs.length; j++) {
      if (accountDefs[j]?.name) {
        nameToAddr.set(accountDefs[j].name, ix.accounts[j]);
      }
    }
    const pdaEdgeIds = new Set<string>();
    for (let j = 0; j < ix.accounts.length && j < accountDefs.length; j++) {
      const def = accountDefs[j];
      if (!def?.pda) continue;
      const addr = ix.accounts[j];
      if (excludedAddresses.has(addr)) continue;
      const sourceNodeId = `${clusterId}-${addr}`;

      for (const seed of def.pda.seeds) {
        if (seed.kind !== "account") continue;
        // The seed path references another account name — try exact match first,
        // then match by suffix (e.g. "rewards_escrow" matches "common.rewards_escrow")
        let targetAddr = nameToAddr.get(seed.path);
        if (!targetAddr) {
          for (const [name, a] of nameToAddr) {
            if (name.endsWith(`.${seed.path}`) || name === seed.path) {
              targetAddr = a;
              break;
            }
          }
        }
        if (!targetAddr || excludedAddresses.has(targetAddr) || targetAddr === addr) continue;
        const targetNodeId = `${clusterId}-${targetAddr}`;
        const edgeKey = `${sourceNodeId}-pda-${targetNodeId}`;
        if (pdaEdgeIds.has(edgeKey)) continue;
        pdaEdgeIds.add(edgeKey);
        clusterEdges.push({
          id: edgeKey,
          source: targetNodeId,
          target: sourceNodeId,
          label: `pda seed`,
          style: { stroke: "hsl(280, 60%, 55%)", strokeWidth: 1.5, strokeDasharray: "4 3" },
        });
      }
    }

    // Create args node at top of cluster if there are decoded args
    if (hasArgs && ix.decoded?.args) {
      const argsNodeId = `${clusterId}-args`;
      const argsNode: Node = {
        id: argsNodeId,
        type: "txArgs",
        position: { x: CLUSTER_PADDING, y: CLUSTER_PADDING + 10 },
        parentId: clusterId,
        extent: "parent" as const,
        data: {
          args: ix.decoded.args,
        },
      };
      clusterNodes.push(argsNode);
    }

    const cluster: InstructionCluster = {
      instructionIndex: ixDisplayIndex,
      clusterId,
      label,
      nodes: clusterNodes,
      edges: clusterEdges,
      innerInstructions,
    };
    clusters.push(cluster);

    allNodes.push(...clusterNodes);
    allEdges.push(...clusterEdges);

    clusterY += clusterHeight + CLUSTER_GAP_Y;
  }

  return { nodes: allNodes, edges: allEdges, clusters };
}
