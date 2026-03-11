import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import type { UserRelationshipDef } from "@/types/relationships";

const STORAGE_KEY = "solana-graph-explorer:user-relationships";

export type RpcEndpointKey = "mainnet" | "devnet" | "custom";

interface RpcOption {
  key: RpcEndpointKey;
  label: string;
  url: string;
}

export const RPC_OPTIONS: RpcOption[] = [
  { key: "mainnet", label: "Mainnet Beta", url: "https://api.mainnet-beta.solana.com" },
  { key: "devnet", label: "Devnet", url: "https://api.devnet.solana.com" },
  { key: "custom", label: "Custom", url: "" },
];

interface SettingsContextValue {
  rpcEndpoint: string;
  rpcEndpointKey: RpcEndpointKey;
  setRpcEndpointKey: (key: RpcEndpointKey) => void;
  setCustomRpcUrl: (url: string) => void;
  customRpcUrl: string;
  userRelationships: UserRelationshipDef[];
  addUserRelationship: (rel: UserRelationshipDef) => void;
  removeUserRelationship: (id: string) => void;
}

function loadRelationships(): UserRelationshipDef[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as UserRelationshipDef[];
  } catch {
    // ignore
  }
  return [];
}

function saveRelationships(rels: UserRelationshipDef[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rels));
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [rpcEndpointKey, setRpcEndpointKey] = useState<RpcEndpointKey>("mainnet");
  const [customRpcUrl, setCustomRpcUrl] = useState("");
  const [userRelationships, setUserRelationships] = useState<UserRelationshipDef[]>(
    loadRelationships
  );

  const rpcEndpoint =
    rpcEndpointKey === "custom"
      ? customRpcUrl
      : (RPC_OPTIONS.find((o) => o.key === rpcEndpointKey)?.url ?? RPC_OPTIONS[0].url);

  const addUserRelationship = useCallback((rel: UserRelationshipDef) => {
    setUserRelationships((prev) => {
      const next = [...prev.filter((r) => r.id !== rel.id), rel];
      saveRelationships(next);
      return next;
    });
  }, []);

  const removeUserRelationship = useCallback((id: string) => {
    setUserRelationships((prev) => {
      const next = prev.filter((r) => r.id !== id);
      saveRelationships(next);
      return next;
    });
  }, []);

  return (
    <SettingsContext.Provider
      value={{
        rpcEndpoint,
        rpcEndpointKey,
        setRpcEndpointKey,
        customRpcUrl,
        setCustomRpcUrl,
        userRelationships,
        addUserRelationship,
        removeUserRelationship,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return ctx;
}
