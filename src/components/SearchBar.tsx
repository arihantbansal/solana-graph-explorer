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

/** Basic Solana address validation: base58, 32-44 chars. */
function isValidAddress(addr: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
}

export function SearchBar() {
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const { rpcEndpointKey, setRpcEndpointKey, customRpcUrl, setCustomRpcUrl } =
    useSettings();
  const { dispatch } = useGraph();

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

    // Add a mock node for now (engine not ready)
    const node: AccountNode = {
      id: trimmed,
      type: "account",
      position: { x: Math.random() * 400, y: Math.random() * 400 },
      data: {
        address: trimmed,
        isExpanded: false,
        isLoading: true,
        accountType: "Unknown",
      },
    };
    dispatch({ type: "ADD_NODES", nodes: [node] });
    dispatch({ type: "SELECT_NODE", nodeId: trimmed });

    // Simulate loading complete after a delay
    setTimeout(() => {
      dispatch({
        type: "SET_NODE_DATA",
        nodeId: trimmed,
        data: {
          isLoading: false,
          balance: 1_500_000_000,
          programName: "System Program",
          programId: "11111111111111111111111111111111",
        },
      });
    }, 1000);
  }, [address, dispatch]);

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
