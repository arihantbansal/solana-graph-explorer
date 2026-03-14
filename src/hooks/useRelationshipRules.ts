import { useEffect, useRef } from "react";
import { useGraph } from "@/contexts/GraphContext";
import { useSettings } from "@/contexts/SettingsContext";
import { useExploreAddress } from "@/hooks/useExploreAddress";
import { derivePdaFromRule } from "@/engine/relationshipRules";
import { fetchAccount } from "@/solana/fetchAccount";
import type { AccountEdge } from "@/types/graph";

/**
 * Hook that watches for loaded nodes matching PDA relationship rules
 * and auto-derives + adds the target PDA accounts to the graph.
 */
export function useRelationshipRules() {
  const { state, dispatch } = useGraph();
  const { relationshipRules, rpcEndpoint } = useSettings();
  const exploreAddress = useExploreAddress();
  // Track processed {nodeId}:{ruleId} pairs to avoid loops
  const processedPairs = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Clear processed pairs when the graph is reset (e.g. new search clears graph)
    if (state.nodes.length <= 1 && processedPairs.current.size > 0) {
      processedPairs.current.clear();
    }

    if (relationshipRules.length === 0) return;

    for (const node of state.nodes) {
      // Only process nodes that have finished loading and have data
      if (node.data.isLoading) continue;
      if (!node.data.accountType) continue;
      if (!node.data.decodedData) continue;

      for (const rule of relationshipRules) {
        // Match source account type and program
        if (rule.sourceAccountType !== node.data.accountType) continue;
        if (rule.sourceProgram) {
          if (
            rule.sourceProgram !== node.data.programId &&
            rule.sourceProgram !== node.data.programName
          ) {
            continue;
          }
        }

        const pairKey = `${node.id}:${rule.id}`;
        if (processedPairs.current.has(pairKey)) continue;

        // Mark as processed immediately to avoid re-triggering
        processedPairs.current.add(pairKey);

        // Derive PDA asynchronously.
        // Note: we capture node.id and rule here but NOT state.nodes/edges,
        // because by the time the promise resolves the graph state may have changed.
        // ADD_EDGES already deduplicates, so we can safely dispatch without checking.
        const nodeId = node.id;
        const ruleSnapshot = rule;
        derivePdaFromRule(ruleSnapshot, node.data).then(async (derivedAddress) => {
          if (!derivedAddress) return;

          // Always add the edge — ADD_EDGES deduplicates by id
          const edgeId = `pda-rule-${ruleSnapshot.id}-${nodeId}-${derivedAddress}`;
          const edge: AccountEdge = {
            id: edgeId,
            source: nodeId,
            target: derivedAddress,
            data: {
              relationshipType: "user_defined",
              label: ruleSnapshot.label,
              ruleId: ruleSnapshot.id,
            },
          };
          dispatch({ type: "ADD_EDGES", edges: [edge] });

          // Check if the account exists on-chain before adding to graph.
          // PDA rules often derive addresses that may not exist (e.g. mobile
          // hotspot info for an IoT device) — silently skip those.
          try {
            const account = await fetchAccount(derivedAddress, rpcEndpoint);
            if (!account) return; // Account doesn't exist — skip silently
          } catch {
            return; // Fetch failed — skip silently
          }

          // Explore the derived address (adds node + edge + fetches data)
          exploreAddress(derivedAddress, {
            sourceNodeId: nodeId,
            fieldName: ruleSnapshot.label,
            depth: 1,
            skipSelect: true,
          });
        });
      }
    }
  }, [state.nodes, relationshipRules, dispatch, exploreAddress, rpcEndpoint]);
}
