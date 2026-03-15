import type { Dispatch } from "react";
import type { GraphAction } from "@/types/graph";
import type { Idl, IdlTypeDef } from "@/types/idl";
import { fetchAccount } from "@/solana/fetchAccount";
import { fetchAccountsBatch } from "@/solana/fetchAccounts";
import { fetchIdl, deriveIdlAddress, deriveMetadataIdlAddress, tryParseIdlFromAccount } from "@/solana/fetchIdl";
import { getIdl, setIdl, hasIdl } from "@/solana/idlCache";
import { identifyAccountType, decodeAccountData, decodeStructData } from "./accountDecoder";
import { identifyBuiltinAccount, splTokenIdl, trimNullPaddedStrings, METAPLEX_METADATA_PROGRAM_ID } from "@/solana/builtinIdls";
import { getProgramDerivedAddress, getAddressEncoder, address as toAddress } from "@solana/kit";
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

/** Sentinel result for accounts not found on-chain. */
const NOT_FOUND_RESULT: FetchDecodeResult = {
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

/** Build a FetchDecodeResult from a DAS asset. */
function dasAssetResult(asset: { name: string; image: string | null; isNft: boolean; owner: string | null; uri?: string }): FetchDecodeResult {
  const data: Record<string, unknown> = {};
  if (asset.owner) data.owner = asset.owner;
  if (asset.uri) data.uri = asset.uri;
  return {
    decodedData: Object.keys(data).length > 0 ? data : null,
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

/**
 * Decode account data using built-in IDLs and/or a fetched IDL.
 * Shared by both single-account and batch-account decode paths.
 */
function decodeAccountWithIdl(
  data: Uint8Array,
  owner: string,
  idl: Idl | null,
): { decodedData: Record<string, unknown> | null; accountType: string | null; idl: Idl | null; typeDef: IdlTypeDef | null; programName: string | null } {
  let decodedData: Record<string, unknown> | null = null;
  let accountType: string | null = null;
  let typeDef: IdlTypeDef | null = null;
  let programName: string | null = null;

  const builtin = identifyBuiltinAccount(data.length, owner, data);
  if (builtin) {
    accountType = builtin.name;
    typeDef = builtin.typeDef;
    idl = idl ?? builtin.idl;
    programName = idl.metadata?.name ?? owner;
    try {
      decodedData = decodeStructData(data, builtin.typeDef, builtin.idl);
      // Metaplex pads strings with null bytes — trim them
      if (decodedData && owner === METAPLEX_METADATA_PROGRAM_ID) {
        trimNullPaddedStrings(decodedData);
      }
    } catch { /* decoding failed */ }
  } else if (idl) {
    programName = idl.metadata?.name ?? owner;
    const identified = identifyAccountType(data, idl);
    if (identified) {
      accountType = identified.name;
      typeDef = idl.types?.find((t) => t.name === identified.name) ?? null;
      if (typeDef) {
        try {
          decodedData = decodeAccountData(data, typeDef, idl);
        } catch { /* decoding failed */ }
      }
    }
  }

  return { decodedData, accountType, idl, typeDef, programName };
}

/**
 * Derive the Metaplex Token Metadata PDA for a given mint.
 */
async function deriveMetadataPda(mint: string): Promise<string> {
  const encoder = getAddressEncoder();
  const [pda] = await getProgramDerivedAddress({
    programAddress: toAddress(METAPLEX_METADATA_PROGRAM_ID),
    seeds: [
      new TextEncoder().encode("metadata"),
      encoder.encode(toAddress(METAPLEX_METADATA_PROGRAM_ID)),
      encoder.encode(toAddress(mint)),
    ],
  });
  return pda;
}

/**
 * Enrich token-related accounts with extra display fields:
 * - tokenAccount: add amount_raw, formatted amount, token name/symbol from DAS
 * - mint: add token name/symbol from DAS, tokenMetadata PDA address
 */
async function enrichTokenFields(
  decodedData: Record<string, unknown>,
  accountType: string | null,
  accountAddress: string,
  rpcUrl: string,
): Promise<void> {
  if (accountType === "tokenAccount") {
    await enrichTokenAccount(decodedData, rpcUrl);
  } else if (accountType === "mint") {
    await enrichMintAccount(decodedData, accountAddress, rpcUrl);
  }
}

async function enrichTokenAccount(
  decodedData: Record<string, unknown>,
  rpcUrl: string,
): Promise<void> {
  const mintAddr = decodedData.mint as string | undefined;
  if (!mintAddr) return;

  // Fetch token name/symbol via DAS (will be prepended to top later)
  let tokenName: string | undefined;
  let tokenSymbol: string | undefined;
  try {
    const asset = await detectAsset(mintAddr, rpcUrl);
    if (asset?.name) tokenName = asset.name;
    if (asset?.symbol) tokenSymbol = asset.symbol;
  } catch { /* DAS unavailable */ }

  // Format amount using mint decimals
  let formattedAmount: string | undefined;
  if (decodedData.amount) {
    const rawAmount = decodedData.amount;

    try {
      const mintAccount = await fetchAccount(mintAddr, rpcUrl);
      if (mintAccount && mintAccount.data.length >= 82) {
        const mintTypeDef = splTokenIdl.types!.find((t) => t.name === "mint")!;
        const mintData = decodeStructData(mintAccount.data, mintTypeDef, splTokenIdl);
        if (mintData && typeof mintData.decimals === "number") {
          const raw = typeof rawAmount === "bigint" ? rawAmount : BigInt(String(rawAmount));
          const divisor = 10 ** mintData.decimals;
          formattedAmount = (Number(raw) / divisor).toLocaleString(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: mintData.decimals,
          });
        }
      }
    } catch { /* mint fetch failed */ }
  }

  // Rebuild decodedData with Token Name/Symbol at top and amount/amount_raw adjacent
  reorderTokenFields(decodedData, tokenName, tokenSymbol, formattedAmount);
}

async function enrichMintAccount(
  decodedData: Record<string, unknown>,
  mintAddress: string,
  rpcUrl: string,
): Promise<void> {
  // Fetch token name/symbol via DAS
  let tokenName: string | undefined;
  let tokenSymbol: string | undefined;
  try {
    const asset = await detectAsset(mintAddress, rpcUrl);
    if (asset?.name) tokenName = asset.name;
    if (asset?.symbol) tokenSymbol = asset.symbol;
  } catch { /* DAS unavailable */ }

  // Derive and add the token metadata PDA address
  let metadataPda: string | undefined;
  try {
    metadataPda = await deriveMetadataPda(mintAddress);
  } catch { /* derivation failed */ }

  // Rebuild with Token Name/Symbol at top
  reorderMintFields(decodedData, tokenName, tokenSymbol, metadataPda);
}

/**
 * Reorder token account fields: Token Name, Token Symbol at top, amount and amount_raw adjacent.
 * Mutates the object in place by deleting and re-inserting keys.
 */
function reorderTokenFields(
  data: Record<string, unknown>,
  tokenName: string | undefined,
  tokenSymbol: string | undefined,
  formattedAmount: string | undefined,
): void {
  // Save the raw amount before we rebuild
  const rawAmount = data.amount;

  // Save all existing keys/values
  const entries = Object.entries(data);

  // Clear the object
  for (const key of Object.keys(data)) {
    delete data[key];
  }

  // 1. Token Name / Token Symbol at top
  if (tokenName) data["Token Name"] = tokenName;
  if (tokenSymbol) data["Token Symbol"] = tokenSymbol;

  // 2. Re-add all original fields, but handle amount specially
  for (const [key, value] of entries) {
    if (key === "amount") {
      // Put amount and amount_raw adjacent
      data.amount = formattedAmount ?? value;
      data.amount_raw = rawAmount;
    } else {
      data[key] = value;
    }
  }

  // If amount wasn't in the original entries but we have formatted, add it
  if (!("amount" in data) && formattedAmount) {
    data.amount = formattedAmount;
    if (rawAmount !== undefined) data.amount_raw = rawAmount;
  }
}

/**
 * Reorder mint fields: Token Name, Token Symbol at top, tokenMetadata at end.
 * Mutates the object in place.
 */
function reorderMintFields(
  data: Record<string, unknown>,
  tokenName: string | undefined,
  tokenSymbol: string | undefined,
  metadataPda: string | undefined,
): void {
  const entries = Object.entries(data);
  for (const key of Object.keys(data)) {
    delete data[key];
  }

  // 1. Token Name / Token Symbol at top
  if (tokenName) data["Token Name"] = tokenName;
  if (tokenSymbol) data["Token Symbol"] = tokenSymbol;

  // 2. Original fields
  for (const [key, value] of entries) {
    data[key] = value;
  }

  // 3. tokenMetadata at end
  if (metadataPda) data.tokenMetadata = metadataPda;
}

/**
 * Try DAS asset detection as a fallback, or return NOT_FOUND_RESULT.
 */
async function fallbackToDasOrNotFound(addr: string, rpcUrl: string): Promise<FetchDecodeResult> {
  try {
    const asset = await detectAsset(addr, rpcUrl);
    if (asset) return dasAssetResult(asset);
  } catch { /* DAS not available */ }
  return { ...NOT_FOUND_RESULT };
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
      return await fallbackToDasOrNotFound(addr, rpcUrl);
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

    const decoded = decodeAccountWithIdl(account.data, account.owner, idl);

    // Enrich token accounts and mints with extra display fields
    if (decoded.decodedData) {
      await enrichTokenFields(decoded.decodedData, decoded.accountType, addr, rpcUrl);
    }

    return {
      ...decoded,
      programId: owner,
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

  // Step 3: Decode each account using shared logic
  for (const addr of addresses) {
    const account = accountMap.get(addr);

    if (!account) {
      results.set(addr, await fallbackToDasOrNotFound(addr, rpcUrl));
      continue;
    }

    const owner = account.owner;
    const idl: Idl | null = hasIdl(owner) ? (getIdl(owner) ?? null) : null;
    const decoded = decodeAccountWithIdl(account.data, owner, idl);

    results.set(addr, {
      ...decoded,
      programId: owner,
      balance: Number(account.lamports),
      thumbnail: undefined,
      error: undefined,
      notFound: false,
    });
  }

  // Enrich token accounts and mints with extra display fields (parallel)
  const enrichPromises: Promise<void>[] = [];
  for (const [addr, result] of results) {
    if (result.decodedData) {
      enrichPromises.push(enrichTokenFields(result.decodedData, result.accountType, addr, rpcUrl));
    }
  }
  await Promise.all(enrichPromises);

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
