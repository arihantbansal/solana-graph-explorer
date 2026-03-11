import type { Dispatch } from "react";
import type { GraphAction } from "@/types/graph";
import type { Idl, IdlTypeDef } from "@/types/idl";
import { fetchAccount } from "@/solana/fetchAccount";
import { fetchIdl } from "@/solana/fetchIdl";
import { getIdl, setIdl, hasIdl } from "@/solana/idlCache";
import { identifyAccountType, decodeAccountData } from "./accountDecoder";
import { inferAllRelationships } from "./relationshipEngine";
import { buildExpansionGraph } from "./graphBuilder";

export interface ExpandResult {
  decodedData: Record<string, unknown> | null;
  accountType: string | null;
  idl: Idl | null;
  typeDef: IdlTypeDef | null;
}

/**
 * Fetch and decode a single account, updating the graph node with results.
 * Does NOT expand relationships — call expandRelationships separately.
 */
export async function loadAccount(
  address: string,
  rpcUrl: string,
  dispatch: Dispatch<GraphAction>,
  options?: ExpandOptions,
): Promise<ExpandResult> {
  dispatch({
    type: "SET_NODE_DATA",
    nodeId: address,
    data: { isLoading: true, error: undefined },
  });

  try {
    const account = await fetchAccount(address, rpcUrl);
    if (!account) {
      dispatch({
        type: "SET_NODE_DATA",
        nodeId: address,
        data: {
          isLoading: false,
          error: "Account not found",
        },
      });
      return { decodedData: null, accountType: null, idl: null, typeDef: null };
    }

    const owner = account.owner;
    const lamports = account.lamports;

    // Update with basic info immediately
    dispatch({
      type: "SET_NODE_DATA",
      nodeId: address,
      data: {
        programId: owner,
        balance: Number(lamports),
      },
    });

    // Try to get IDL for the owning program
    let idl: Idl | null = null;
    if (hasIdl(owner)) {
      idl = getIdl(owner) ?? null;
    } else {
      try {
        idl = await fetchIdl(owner, rpcUrl);
        if (idl) {
          setIdl(owner, idl);
          options?.onIdlFetched?.(owner, idl);
        }
      } catch {
        // IDL fetch failed — proceed without it
      }
    }

    let decodedData: Record<string, unknown> | null = null;
    let accountType: string | null = null;
    let typeDef: IdlTypeDef | null = null;

    if (idl) {
      const programName = idl.metadata?.name ?? owner;
      dispatch({
        type: "SET_NODE_DATA",
        nodeId: address,
        data: { programName },
      });

      // Identify account type
      const identified = identifyAccountType(account.data, idl);
      if (identified) {
        accountType = identified.name;
        typeDef = idl.types?.find((t) => t.name === identified.name) ?? null;

        if (typeDef) {
          try {
            decodedData = decodeAccountData(account.data, typeDef, idl);
          } catch {
            // Decoding failed — show type but no data
          }
        }
      }
    }

    dispatch({
      type: "SET_NODE_DATA",
      nodeId: address,
      data: {
        isLoading: false,
        accountType: accountType ?? "Unknown",
        decodedData: decodedData ?? undefined,
      },
    });

    return { decodedData, accountType, idl, typeDef };
  } catch (err) {
    dispatch({
      type: "SET_NODE_DATA",
      nodeId: address,
      data: {
        isLoading: false,
        error: err instanceof Error ? err.message : "Failed to fetch account",
      },
    });
    return { decodedData: null, accountType: null, idl: null, typeDef: null };
  }
}

/**
 * Full expand pipeline: load account, infer relationships, build graph expansion,
 * add new nodes/edges, then load each new related account.
 */
export interface ExpandOptions {
  onIdlFetched?: (programId: string, idl: Idl) => void;
}

export async function expandAccount(
  address: string,
  sourcePosition: { x: number; y: number },
  rpcUrl: string,
  existingNodeIds: Set<string>,
  dispatch: Dispatch<GraphAction>,
  options?: ExpandOptions,
): Promise<void> {
  const result = await loadAccount(address, rpcUrl, dispatch, options);

  if (!result.decodedData) {
    dispatch({
      type: "SET_NODE_DATA",
      nodeId: address,
      data: { isExpanded: true },
    });
    return;
  }

  // Infer relationships
  const relationships = inferAllRelationships({
    sourceAddress: address,
    decodedData: result.decodedData,
    typeDef: result.typeDef ?? undefined,
    idl: result.idl ?? undefined,
  });

  if (relationships.length === 0) {
    dispatch({
      type: "SET_NODE_DATA",
      nodeId: address,
      data: { isExpanded: true },
    });
    return;
  }

  // Build graph expansion
  const expansion = buildExpansionGraph(
    address,
    sourcePosition,
    relationships,
    existingNodeIds,
  );

  // Add nodes and edges to graph
  if (expansion.nodes.length > 0) {
    dispatch({ type: "ADD_NODES", nodes: expansion.nodes });
  }
  if (expansion.edges.length > 0) {
    dispatch({ type: "ADD_EDGES", edges: expansion.edges });
  }

  dispatch({
    type: "SET_NODE_DATA",
    nodeId: address,
    data: { isExpanded: true },
  });

  // Load each related account (fire and forget, they update individually)
  for (const node of expansion.nodes) {
    loadAccount(node.id, rpcUrl, dispatch);
  }
}
