import { useCallback } from "react";
import { useAsyncCallback } from "react-async-hook";
import { useReactFlow } from "@xyflow/react";
import { useGraph } from "@/contexts/GraphContext";
import { useSettings } from "@/contexts/SettingsContext";
import { useView } from "@/contexts/ViewContext";
import { expandAccount } from "@/engine/expandAccount";
import { makeIdlFetchedHandler } from "@/utils/programSaver";
import type { AccountNode } from "@/types/graph";

/**
 * Hook that returns a callback to clear the graph and explore a single address.
 * Consolidates the repeated "clear -> add node -> expand -> update URL -> fitView" pattern
 * used in SearchBar, FavoriteSearchCard, and PdaSearchDialog.
 */
export function useClearAndExplore() {
  const { dispatch } = useGraph();
  const { rpcEndpoint, saveProgram, collapsedAddresses, expansionDepth } =
    useSettings();
  const { state: viewState, backToGraph } = useView();
  const { fitView } = useReactFlow();

  const doExploreAction = useAsyncCallback(
    async (address: string, opts?: { skipSelect?: boolean }) => {
      // Update URL
      const url = new URL(window.location.href);
      url.searchParams.delete("tx");
      url.searchParams.set("address", address);
      window.history.replaceState({}, "", url.toString());

      // Clear existing graph and start fresh
      dispatch({ type: "CLEAR" });

      const position = { x: 400, y: 300 };
      const node: AccountNode = {
        id: address,
        type: "account",
        position,
        data: {
          address,
          isExpanded: false,
          isLoading: true,
        },
      };
      dispatch({ type: "ADD_NODES", nodes: [node] });
      if (!opts?.skipSelect) {
        dispatch({ type: "SELECT_NODE", nodeId: address });
      }

      const existingIds = new Set([address]);
      await expandAccount({
        address,
        sourcePosition: position,
        rpcUrl: rpcEndpoint,
        existingNodeIds: existingIds,
        dispatch,
        options: {
          onIdlFetched: makeIdlFetchedHandler(saveProgram),
          collapsedAddresses: new Set(collapsedAddresses),
          depth: expansionDepth,
        },
      });
      requestAnimationFrame(() => {
        fitView({ duration: 400, padding: 0.2, maxZoom: 1 });
      });
    },
  );

  return useCallback(
    (address: string, opts?: { skipSelect?: boolean }) => {
      if (viewState.mode === "transaction") {
        backToGraph(address);
      } else {
        doExploreAction.execute(address, opts);
      }
    },
    [viewState.mode, backToGraph, doExploreAction],
  );
}
