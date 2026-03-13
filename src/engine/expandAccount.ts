import type { Dispatch } from "react";
import type { GraphAction } from "@/types/graph";
import type { Idl, IdlTypeDef } from "@/types/idl";
import { fetchAccount } from "@/solana/fetchAccount";
import { fetchAccountsBatch } from "@/solana/fetchAccounts";
import { fetchIdl, deriveIdlAddress, deriveMetadataIdlAddress, tryParseIdlFromAccount } from "@/solana/fetchIdl";
import { getIdl, setIdl, hasIdl } from "@/solana/idlCache";
import { identifyAccountType, decodeAccountData, decodeStructData } from "./accountDecoder";
import { identifyBuiltinAccount } from "@/solana/builtinIdls";
import { inferAllRelationships } from "./relationshipEngine";
import { buildExpansionGraph } from "./graphBuilder";
import { detectAsset } from "./assetDetection";
import type { NodeRect } from "@/utils/layout";
import type { Relationship, TokenRelationship } from "@/types/relationships";

export interface ExpandResult {
  decodedData: Record<string, unknown> | null;
  accountType: string | null;
  idl: Idl | null;
  typeDef: IdlTypeDef | null;
}

/** Extended result from fetchAndDecode that includes data needed for graph node updates. */
export interface FetchDecodeResult extends ExpandResult {
  /** Owner program of the account */
  programId: string | null;
  /** Program display name (from IDL metadata) */
  programName: string | null;
  /** Account balance in lamports */
  balance: number | null;
  /** NFT/asset thumbnail URL */
  thumbnail: string | undefined;
  /** Error message if fetch failed */
  error: string | undefined;
  /** Whether the account was not found */
  notFound: boolean;
}

/**
 * Pure fetch + decode: fetches an account from RPC and decodes it using IDL,
 * WITHOUT dispatching any graph actions. Returns all data needed to update the graph.
 */
export async function fetchAndDecode(
  addr: string,
  rpcUrl: string,
  options?: ExpandOptions,
): Promise<FetchDecodeResult> {
  try {
    const account = await fetchAccount(addr, rpcUrl);
    if (!account) {
      // Try DAS asset detection as fallback (compressed NFTs, etc.)
      try {
        const asset = await detectAsset(addr, rpcUrl);
        if (asset) {
          const assetDecodedData = asset.owner ? { owner: asset.owner } : null;
          return {
            decodedData: assetDecodedData,
            accountType: asset.isNft ? "NFT" : "Asset",
            idl: null,
            typeDef: null,
            programId: null,
            programName: asset.name,
            balance: null,
            thumbnail: asset.image ?? undefined,
            error: undefined,
            notFound: false,
          };
        }
      } catch {
        // DAS not available — fall through
      }

      return {
        decodedData: null,
        accountType: "Not Found",
        idl: null,
        typeDef: null,
        programId: null,
        programName: null,
        balance: null,
        thumbnail: undefined,
        error: undefined,
        notFound: true,
      };
    }

    const owner = account.owner;
    const lamports = account.lamports;

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
    let programName: string | null = null;

    // Try built-in account identification first (SPL Token, etc.)
    const builtin = identifyBuiltinAccount(account.data.length, owner);
    if (builtin) {
      accountType = builtin.name;
      typeDef = builtin.typeDef;
      idl = idl ?? builtin.idl;
      programName = idl.metadata?.name ?? owner;

      try {
        decodedData = decodeStructData(account.data, builtin.typeDef, builtin.idl);
      } catch {
        // Decoding failed — show type but no data
      }
    } else if (idl) {
      programName = idl.metadata?.name ?? owner;

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

    return {
      decodedData,
      accountType,
      idl,
      typeDef,
      programId: owner,
      programName,
      balance: Number(lamports),
      thumbnail: undefined,
      error: undefined,
      notFound: false,
    };
  } catch (err) {
    return {
      decodedData: null,
      accountType: null,
      idl: null,
      typeDef: null,
      programId: null,
      programName: null,
      balance: null,
      thumbnail: undefined,
      error: err instanceof Error ? err.message : "Failed to fetch account",
      notFound: false,
    };
  }
}

/**
 * Batch fetch + decode multiple accounts in as few RPC calls as possible.
 * 1. Batch-fetches all accounts via getMultipleAccounts
 * 2. Batch-fetches IDL accounts for unique owner programs
 * 3. Decodes each account
 */
export async function fetchAndDecodeMany(
  addresses: string[],
  rpcUrl: string,
  options?: ExpandOptions,
): Promise<Map<string, FetchDecodeResult>> {
  const results = new Map<string, FetchDecodeResult>();
  if (addresses.length === 0) return results;

  // Step 1: Batch fetch all accounts
  const accountMap = await fetchAccountsBatch(addresses, rpcUrl);

  // Step 2: Collect unique owner programs that need IDLs
  const ownersNeedingIdl = new Set<string>();
  for (const [, account] of accountMap) {
    if (account && !hasIdl(account.owner)) {
      ownersNeedingIdl.add(account.owner);
    }
  }

  // Batch-fetch IDL accounts for all uncached owners
  if (ownersNeedingIdl.size > 0) {
    // Derive all IDL addresses in parallel
    const derivations = await Promise.all(
      Array.from(ownersNeedingIdl).map(async (programId) => {
        const addrs: { programId: string; addr: string; type: "legacy" | "metadata" }[] = [];
        const [legacy, meta] = await Promise.allSettled([
          deriveIdlAddress(programId),
          deriveMetadataIdlAddress(programId),
        ]);
        if (legacy.status === "fulfilled") addrs.push({ programId, addr: legacy.value, type: "legacy" });
        if (meta.status === "fulfilled") addrs.push({ programId, addr: meta.value, type: "metadata" });
        return addrs;
      }),
    );
    const idlAddresses = derivations.flat();

    if (idlAddresses.length > 0) {
      // Single batched RPC call for ALL IDL accounts across all programs
      const idlAccountMap = await fetchAccountsBatch(
        idlAddresses.map((a) => a.addr),
        rpcUrl,
      );

      // Group by programId and parse IDLs directly from batch results
      const programIdlAddrs = new Map<string, typeof idlAddresses>();
      for (const entry of idlAddresses) {
        const existing = programIdlAddrs.get(entry.programId) ?? [];
        existing.push(entry);
        programIdlAddrs.set(entry.programId, existing);
      }

      for (const [programId, entries] of programIdlAddrs) {
        if (hasIdl(programId)) continue;

        // Try each IDL account (legacy first, then metadata) — parse directly, no re-fetch
        for (const entry of entries) {
          const acct = idlAccountMap.get(entry.addr);
          if (!acct) continue;
          const idl = tryParseIdlFromAccount(acct);
          if (idl) {
            setIdl(programId, idl);
            options?.onIdlFetched?.(programId, idl);
            break;
          }
        }
      }
    }
  }

  // Step 3: Decode each account using existing logic
  for (const addr of addresses) {
    const account = accountMap.get(addr);

    if (!account) {
      // Try DAS asset detection as fallback
      try {
        const asset = await detectAsset(addr, rpcUrl);
        if (asset) {
          results.set(addr, {
            decodedData: asset.owner ? { owner: asset.owner } : null,
            accountType: asset.isNft ? "NFT" : "Asset",
            idl: null,
            typeDef: null,
            programId: null,
            programName: asset.name,
            balance: null,
            thumbnail: asset.image ?? undefined,
            error: undefined,
            notFound: false,
          });
          continue;
        }
      } catch { /* DAS not available */ }

      results.set(addr, {
        decodedData: null,
        accountType: "Not Found",
        idl: null,
        typeDef: null,
        programId: null,
        programName: null,
        balance: null,
        thumbnail: undefined,
        error: undefined,
        notFound: true,
      });
      continue;
    }

    const owner = account.owner;
    let idl: Idl | null = null;
    if (hasIdl(owner)) {
      idl = getIdl(owner) ?? null;
    }

    let decodedData: Record<string, unknown> | null = null;
    let accountType: string | null = null;
    let typeDef: IdlTypeDef | null = null;
    let programName: string | null = null;

    const builtin = identifyBuiltinAccount(account.data.length, owner);
    if (builtin) {
      accountType = builtin.name;
      typeDef = builtin.typeDef;
      idl = idl ?? builtin.idl;
      programName = idl.metadata?.name ?? owner;
      try {
        decodedData = decodeStructData(account.data, builtin.typeDef, builtin.idl);
      } catch { /* decoding failed */ }
    } else if (idl) {
      programName = idl.metadata?.name ?? owner;
      const identified = identifyAccountType(account.data, idl);
      if (identified) {
        accountType = identified.name;
        typeDef = idl.types?.find((t) => t.name === identified.name) ?? null;
        if (typeDef) {
          try {
            decodedData = decodeAccountData(account.data, typeDef, idl);
          } catch { /* decoding failed */ }
        }
      }
    }

    results.set(addr, {
      decodedData,
      accountType,
      idl,
      typeDef,
      programId: owner,
      programName,
      balance: Number(account.lamports),
      thumbnail: undefined,
      error: undefined,
      notFound: false,
    });
  }

  return results;
}

/**
 * Apply a FetchDecodeResult to a graph node by dispatching SET_NODE_DATA.
 */
function applyResultToGraph(
  addr: string,
  result: FetchDecodeResult,
  dispatch: Dispatch<GraphAction>,
): void {
  if (result.error) {
    dispatch({
      type: "SET_NODE_DATA",
      nodeId: addr,
      data: {
        isLoading: false,
        error: result.error,
      },
    });
    return;
  }

  if (result.notFound) {
    dispatch({
      type: "SET_NODE_DATA",
      nodeId: addr,
      data: {
        isLoading: false,
        isExpanded: true,
        accountType: "Not Found",
      },
    });
    return;
  }

  // For DAS assets (no programId)
  if (!result.programId) {
    dispatch({
      type: "SET_NODE_DATA",
      nodeId: addr,
      data: {
        isLoading: false,
        accountType: result.accountType ?? "Unknown",
        programName: result.programName ?? undefined,
        thumbnail: result.thumbnail,
        decodedData: result.decodedData ?? undefined,
      },
    });
    return;
  }

  dispatch({
    type: "SET_NODE_DATA",
    nodeId: addr,
    data: {
      isLoading: false,
      programId: result.programId,
      programName: result.programName ?? undefined,
      balance: result.balance ?? undefined,
      accountType: result.accountType ?? "Unknown",
      decodedData: result.decodedData ?? undefined,
      thumbnail: result.thumbnail,
    },
  });
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

  const result = await fetchAndDecode(address, rpcUrl, options);
  applyResultToGraph(address, result, dispatch);

  return {
    decodedData: result.decodedData,
    accountType: result.accountType,
    idl: result.idl,
    typeDef: result.typeDef,
  };
}

/**
 * Full expand pipeline: load account, infer relationships, build graph expansion,
 * add new nodes/edges, then load each new related account.
 */
export interface ExpandOptions {
  onIdlFetched?: (programId: string, idl: Idl) => void;
  collapsedAddresses?: Set<string>;
  /** How many levels deep to expand (1 = only this node's children, 2 = children + grandchildren, etc.). Default 1. */
  depth?: number;
  /** Pre-loaded fetch+decode result to avoid redundant RPC calls during recursive expansion. */
  _preloadedResult?: FetchDecodeResult;
}

export interface ExpandAccountParams {
  address: string;
  sourcePosition: { x: number; y: number };
  rpcUrl: string;
  existingNodeIds: Set<string>;
  dispatch: Dispatch<GraphAction>;
  options?: ExpandOptions;
  existingRects?: NodeRect[];
}

export async function expandAccount(params: ExpandAccountParams): Promise<void> {
  const { address, sourcePosition, rpcUrl, existingNodeIds, dispatch, options, existingRects } = params;
  const depth = options?.depth ?? 1;

  // depth=0 means just load, don't expand relationships
  if (depth <= 0) {
    if (options?._preloadedResult) {
      applyResultToGraph(address, options._preloadedResult, dispatch);
    } else {
      await loadAccount(address, rpcUrl, dispatch, options);
    }
    return;
  }

  // Skip expansion entirely for always-collapsed addresses
  if (options?.collapsedAddresses?.has(address)) {
    if (options?._preloadedResult) {
      applyResultToGraph(address, options._preloadedResult, dispatch);
    } else {
      await loadAccount(address, rpcUrl, dispatch, options);
    }
    dispatch({
      type: "SET_NODE_DATA",
      nodeId: address,
      data: { isExpanded: true },
    });
    return;
  }

  // Use pre-loaded result if available (from parent's pre-flight fetch),
  // otherwise fetch fresh from RPC.
  let result: ExpandResult;
  if (options?._preloadedResult) {
    const preloaded = options._preloadedResult;
    applyResultToGraph(address, preloaded, dispatch);
    result = {
      decodedData: preloaded.decodedData,
      accountType: preloaded.accountType,
      idl: preloaded.idl,
      typeDef: preloaded.typeDef,
    };
  } else {
    result = await loadAccount(address, rpcUrl, dispatch, options);
  }

  if (!result.decodedData) {
    dispatch({
      type: "SET_NODE_DATA",
      nodeId: address,
      data: { isExpanded: true },
    });
    return;
  }

  // Infer relationships, filtering out mints and likely wallets
  const allRelationships = inferAllRelationships({
    sourceAddress: address,
    decodedData: result.decodedData,
    typeDef: result.typeDef ?? undefined,
    idl: result.idl ?? undefined,
  });
  const collapsed = options?.collapsedAddresses;
  const relationships = filterNoisyRelationships(allRelationships);

  if (relationships.length === 0) {
    dispatch({
      type: "SET_NODE_DATA",
      nodeId: address,
      data: { isExpanded: true },
    });
    return;
  }

  // Build graph expansion (positions computed but nodes not yet added to graph)
  const expansion = buildExpansionGraph(
    address,
    sourcePosition,
    relationships,
    existingNodeIds,
    existingRects,
  );

  // depth=N means N edges of expansion from the starting node.
  // After expanding this node (1 edge), remaining depth is depth-1.
  const remainingDepth = depth - 1;

  // Separate collapsed stubs from normal children to expand
  const collapsedNodes = expansion.nodes.filter((n) => collapsed?.has(n.id));
  const normalNodes = expansion.nodes.filter((n) => !collapsed?.has(n.id));

  // Add collapsed nodes: fetch their data but don't expand their relationships
  if (collapsedNodes.length > 0) {
    dispatch({ type: "ADD_NODES", nodes: collapsedNodes });
    const collapsedIds = new Set(collapsedNodes.map((n) => n.id));
    const stubEdges = expansion.edges.filter(
      (edge) => collapsedIds.has(edge.target) || collapsedIds.has(edge.source),
    );
    if (stubEdges.length > 0) {
      dispatch({ type: "ADD_EDGES", edges: stubEdges });
    }
    // Batch fetch and decode all collapsed nodes
    const collapsedResults = await fetchAndDecodeMany(
      collapsedNodes.map((n) => n.id),
      rpcUrl,
      options,
    );
    for (const node of collapsedNodes) {
      const result = collapsedResults.get(node.id);
      if (result) applyResultToGraph(node.id, result, dispatch);
    }
  }

  // Pre-load ALL normal child accounts in a single batched RPC call.
  // This avoids the flash where nodes appear briefly then get removed.
  const batchResults = await fetchAndDecodeMany(
    normalNodes.map((n) => n.id),
    rpcUrl,
    options,
  );
  const preloadResults = normalNodes.map((node) => ({
    node,
    result: batchResults.get(node.id)!,
  }));

  // Filter out uninteresting nodes (no data, mints, etc.)
  const keptChildren = preloadResults.filter(
    ({ result }) => !shouldRemoveNode(result),
  );
  const keptNodeIds = new Set(keptChildren.map(({ node }) => node.id));

  // Only add nodes that passed the filter
  const keptNodes = keptChildren.map(({ node }) => node);
  // Only add edges whose targets are kept (or already exist in the graph)
  const normalEdges = expansion.edges.filter(
    (edge) => keptNodeIds.has(edge.target) || existingNodeIds.has(edge.target),
  );

  if (keptNodes.length > 0) {
    dispatch({ type: "ADD_NODES", nodes: keptNodes });
  }
  if (normalEdges.length > 0) {
    dispatch({ type: "ADD_EDGES", edges: normalEdges });
  }

  dispatch({
    type: "SET_NODE_DATA",
    nodeId: address,
    data: { isExpanded: true },
  });

  // Apply the pre-loaded data to graph nodes and recursively expand survivors
  const expandPromises: Promise<void>[] = [];
  for (const { node, result: childResult } of keptChildren) {
    if (remainingDepth > 0 && childResult.decodedData) {
      // Recursively expand, passing the pre-loaded data to avoid redundant RPC call
      expandPromises.push(
        expandAccount({
          address: node.id,
          sourcePosition: node.position,
          rpcUrl,
          existingNodeIds: new Set([...existingNodeIds, ...keptNodes.map((n) => n.id)]),
          dispatch,
          options: { ...options, depth: remainingDepth, _preloadedResult: childResult },
          existingRects,
        }),
      );
    } else {
      // Leaf node — just apply the already-fetched data
      applyResultToGraph(node.id, childResult, dispatch);
    }
  }

  await Promise.all(expandPromises);
}

/**
 * Returns true if a loaded account is uninteresting and should be removed
 * from the graph (no decoded data, or is a token mint).
 * User-initiated expansions bypass this — it only applies to auto-loaded children.
 */
function shouldRemoveNode(result: ExpandResult): boolean {
  // Keep compressed assets / NFTs (no decodedData but have accountType from DAS)
  if (!result.decodedData) {
    const type = result.accountType?.toLowerCase();
    if (type === "nft" || type === "asset") return false;
    // No data, no special type — plain wallet / system account
    return true;
  }

  // Token mints are leaf nodes with no useful graph connections
  if (result.accountType?.toLowerCase() === "mint") return true;

  return false;
}

/**
 * Filter out relationships that create noise in the graph:
 * - Token relationships to mints (mint accounts are removed after loading anyway,
 *   but skipping them here avoids the flash of a loading node)
 */
function filterNoisyRelationships(relationships: Relationship[]): Relationship[] {
  return relationships.filter((rel) => {
    if (rel.type === "token" && (rel as TokenRelationship).tokenType === "mint") {
      return false;
    }
    return true;
  });
}
