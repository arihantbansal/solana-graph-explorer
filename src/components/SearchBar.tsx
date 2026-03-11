import { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSettings, RPC_OPTIONS, type RpcEndpointKey } from "@/contexts/SettingsContext";
import { useGraph } from "@/contexts/GraphContext";
import type { AccountNode } from "@/types/graph";
import { Search } from "lucide-react";
import { expandAccount } from "@/engine/expandAccount";
import type { ProgramEntry } from "@/types/pdaExplorer";

/** Basic Solana address validation: base58, 32-44 chars. */
function isValidAddress(addr: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
}

export function SearchBar() {
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const { rpcEndpoint, rpcEndpointKey, setRpcEndpointKey, customRpcUrl, setCustomRpcUrl, saveProgram } =
    useSettings();
  const { state, dispatch } = useGraph();

  const handleExplore = useCallback(() => {
    const trimmed = address.trim();
    if (!trimmed) {
      setError("Enter an address");
      return;
    }
    if (!isValidAddress(trimmed)) {
      setError("Invalid Solana address");
      return;
    }
    setError("");

    const position = { x: 400, y: 300 };
    const node: AccountNode = {
      id: trimmed,
      type: "account",
      position,
      data: {
        address: trimmed,
        isExpanded: false,
        isLoading: true,
      },
    };
    dispatch({ type: "ADD_NODES", nodes: [node] });
    dispatch({ type: "SELECT_NODE", nodeId: trimmed });

    const existingIds = new Set(state.nodes.map((n) => n.id));
    existingIds.add(trimmed);
    expandAccount(trimmed, position, rpcEndpoint, existingIds, dispatch, {
      onIdlFetched: (programId, idl) => {
        const entry: ProgramEntry = {
          programId,
          programName: idl.metadata?.name ?? programId,
          idlFetchedAt: Date.now(),
          idl,
        };
        saveProgram(entry);
      },
    });
  }, [address, dispatch, rpcEndpoint, state.nodes, saveProgram]);

  return (
    <div className="flex items-center gap-2 p-3 border-b bg-background">
      <div className="flex items-center gap-2 flex-1 max-w-2xl">
        <div className="flex-1 relative">
          <Input
            placeholder="Enter Solana address..."
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
              if (error) setError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleExplore();
            }}
            className={error ? "border-destructive" : ""}
          />
          {error && (
            <div className="absolute text-[11px] text-destructive mt-0.5">
              {error}
            </div>
          )}
        </div>
        <Button onClick={handleExplore} size="sm">
          <Search className="size-4 mr-1" />
          Explore
        </Button>
      </div>

      <div className="flex items-center gap-2 ml-auto">
        <Select
          value={rpcEndpointKey}
          onValueChange={(v) => setRpcEndpointKey(v as RpcEndpointKey)}
        >
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RPC_OPTIONS.map((opt) => (
              <SelectItem key={opt.key} value={opt.key}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {rpcEndpointKey === "custom" && (
          <Input
            placeholder="https://..."
            value={customRpcUrl}
            onChange={(e) => setCustomRpcUrl(e.target.value)}
            className="w-60"
            size={1}
          />
        )}
      </div>
    </div>
  );
}
