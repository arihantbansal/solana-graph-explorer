import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { usePersistedState } from "@/hooks/usePersistedState";
import type { PdaRelationshipRule } from "@/types/relationships";
import type { ProgramEntry, SavedPdaSearch } from "@/types/pdaExplorer";
import {
  loadSavedPrograms,
  saveProgramEntries,
} from "@/utils/localStorage";
import {
  loadAddressLabels,
  saveAddressLabels,
  type AddressLabels,
} from "@/utils/addressLabels";
import { fetchIdl } from "@/solana/fetchIdl";
import { setIdl } from "@/solana/idlCache";
import type { BytesDisplayEncoding } from "@/utils/bytesDisplay";

const RULES_STORAGE_KEY = "solana-graph-explorer:relationship-rules";
const BYTES_ENCODINGS_KEY = "solana-graph-explorer:bytes-encodings";
const PDA_SEARCHES_KEY = "solana-graph-explorer:saved-pda-searches";
const COLLAPSED_ADDRESSES_KEY = "solana-graph-explorer:collapsed-addresses";
const EXPANSION_DEPTH_KEY = "solana-graph-explorer:expansion-depth";
const DARK_MODE_KEY = "solana-graph-explorer:dark-mode";
const DEFAULT_EXPANSION_DEPTH = 2;

/** Map of "accountType:fieldName" → preferred encoding */
export type BytesEncodings = Record<string, BytesDisplayEncoding>;

export type RpcEndpointKey = "mainnet" | "devnet" | "local" | "custom";

interface RpcOption {
  key: RpcEndpointKey;
  label: string;
  url: string;
}

export const RPC_OPTIONS: RpcOption[] = [
  { key: "mainnet", label: "Mainnet", url: import.meta.env.VITE_RPC_MAINNET ?? "https://api.mainnet-beta.solana.com" },
  { key: "devnet", label: "Devnet", url: import.meta.env.VITE_RPC_DEVNET ?? "https://api.devnet.solana.com" },
  { key: "local", label: "Local", url: "http://127.0.0.1:8899" },
  { key: "custom", label: "Custom", url: "" },
];

interface SettingsContextValue {
  rpcEndpoint: string;
  rpcEndpointKey: RpcEndpointKey;
  setRpcEndpointKey: (key: RpcEndpointKey) => void;
  setCustomRpcUrl: (url: string) => void;
  customRpcUrl: string;
  relationshipRules: PdaRelationshipRule[];
  addRelationshipRule: (rule: PdaRelationshipRule) => void;
  removeRelationshipRule: (id: string) => void;
  savedPrograms: ProgramEntry[];
  saveProgram: (entry: ProgramEntry) => void;
  removeProgram: (programId: string) => void;
  refreshProgram: (programId: string, entry: ProgramEntry) => void;
  addressLabels: AddressLabels;
  setAddressLabel: (address: string, label: string) => void;
  removeAddressLabel: (address: string) => void;
  getLabel: (address: string) => string | undefined;
  bytesEncodings: BytesEncodings;
  setBytesEncoding: (accountType: string, fieldName: string, encoding: BytesDisplayEncoding) => void;
  getBytesEncoding: (accountType: string, fieldName: string) => BytesDisplayEncoding | undefined;
  savedPdaSearches: SavedPdaSearch[];
  addPdaSearch: (search: SavedPdaSearch) => void;
  removePdaSearch: (id: string) => void;
  collapsedAddresses: string[];
  addCollapsedAddress: (address: string) => void;
  removeCollapsedAddress: (address: string) => void;
  isCollapsedAddress: (address: string) => boolean;
  expansionDepth: number;
  setExpansionDepth: (depth: number) => void;
  darkMode: boolean;
  setDarkMode: (dark: boolean) => void;
  exportSettings: () => string;
  importSettings: (json: string) => void;
}

function loadRules(): PdaRelationshipRule[] {
  try {
    const raw = localStorage.getItem(RULES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Migration: discard old-format rules (they have sourceType/sourceField instead of seedMappings)
    const valid = parsed.filter(
      (r: Record<string, unknown>) =>
        Array.isArray(r.seedMappings) && typeof r.sourceAccountType === "string",
    );
    if (valid.length !== parsed.length) {
      // Save back only valid rules
      localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(valid));
    }
    return valid as PdaRelationshipRule[];
  } catch (err) {
    console.warn("Failed to load relationship rules from localStorage", err);
    return [];
  }
}

function saveRules(rules: PdaRelationshipRule[]) {
  localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(rules));
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

/** Read initial network from URL ?network= param */
function getInitialRpcFromUrl(): { key: RpcEndpointKey; customUrl: string } {
  const params = new URLSearchParams(window.location.search);
  const network = params.get("network");
  const customUrl = params.get("rpc") ?? "";
  if (network && RPC_OPTIONS.some((o) => o.key === network)) {
    return { key: network as RpcEndpointKey, customUrl };
  }
  return { key: "mainnet", customUrl };
}

/** Sync network to URL — only add param if not mainnet */
function syncNetworkToUrl(key: RpcEndpointKey, customUrl: string) {
  const url = new URL(window.location.href);
  if (key === "mainnet") {
    url.searchParams.delete("network");
    url.searchParams.delete("rpc");
  } else {
    url.searchParams.set("network", key);
    if (key === "custom" && customUrl) {
      url.searchParams.set("rpc", customUrl);
    } else {
      url.searchParams.delete("rpc");
    }
  }
  window.history.replaceState({}, "", url.toString());
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const initialRpc = getInitialRpcFromUrl();
  const [rpcEndpointKey, setRpcEndpointKeyState] = useState<RpcEndpointKey>(initialRpc.key);
  const [customRpcUrl, setCustomRpcUrlState] = useState(initialRpc.customUrl);
  const [relationshipRules, setRelationshipRules] = useState<PdaRelationshipRule[]>(
    loadRules
  );
  const [savedPrograms, setSavedPrograms] = useState<ProgramEntry[]>(loadSavedPrograms);
  const [addressLabels, setAddressLabelsState] = useState<AddressLabels>(loadAddressLabels);
  const [bytesEncodings, setBytesEncodingsState] = usePersistedState<BytesEncodings>(BYTES_ENCODINGS_KEY, {});
  const [savedPdaSearches, setSavedPdaSearches] = usePersistedState<SavedPdaSearch[]>(PDA_SEARCHES_KEY, []);
  const [collapsedAddresses, setCollapsedAddresses] = usePersistedState<string[]>(COLLAPSED_ADDRESSES_KEY, []);
  const [expansionDepth, setExpansionDepthState] = usePersistedState<number>(EXPANSION_DEPTH_KEY, DEFAULT_EXPANSION_DEPTH);
  const [darkMode, setDarkModeState] = usePersistedState<boolean>(DARK_MODE_KEY, window.matchMedia("(prefers-color-scheme: dark)").matches);

  // Sync .dark class on <html> element (also set on initial render)
  document.documentElement.classList.toggle("dark", darkMode);

  const setDarkMode = useCallback((dark: boolean) => {
    setDarkModeState(dark);
  }, [setDarkModeState]);

  const rpcEndpoint =
    rpcEndpointKey === "custom"
      ? customRpcUrl
      : (RPC_OPTIONS.find((o) => o.key === rpcEndpointKey)?.url ?? RPC_OPTIONS[0].url);

  const setRpcEndpointKey = useCallback((key: RpcEndpointKey) => {
    setRpcEndpointKeyState(key);
    syncNetworkToUrl(key, customRpcUrl);
  }, [customRpcUrl]);

  const setCustomRpcUrl = useCallback((url: string) => {
    setCustomRpcUrlState(url);
    if (rpcEndpointKey === "custom") {
      syncNetworkToUrl(rpcEndpointKey, url);
    }
  }, [rpcEndpointKey]);

  const addRelationshipRule = useCallback((rule: PdaRelationshipRule) => {
    setRelationshipRules((prev) => {
      const next = [...prev.filter((r) => r.id !== rule.id), rule];
      saveRules(next);
      return next;
    });
  }, []);

  const removeRelationshipRule = useCallback((id: string) => {
    setRelationshipRules((prev) => {
      const next = prev.filter((r) => r.id !== id);
      saveRules(next);
      return next;
    });
  }, []);

  const saveProgram = useCallback((entry: ProgramEntry) => {
    setSavedPrograms((prev) => {
      const next = [...prev.filter((p) => p.programId !== entry.programId), entry];
      saveProgramEntries(next);
      return next;
    });
  }, []);

  const removeProgram = useCallback((programId: string) => {
    setSavedPrograms((prev) => {
      const next = prev.filter((p) => p.programId !== programId);
      saveProgramEntries(next);
      return next;
    });
  }, []);

  const refreshProgram = useCallback((programId: string, entry: ProgramEntry) => {
    setSavedPrograms((prev) => {
      const next = prev.map((p) => (p.programId === programId ? entry : p));
      saveProgramEntries(next);
      return next;
    });
  }, []);

  const setAddressLabel = useCallback((address: string, label: string) => {
    setAddressLabelsState((prev) => {
      const next = { ...prev, [address]: label };
      saveAddressLabels(next);
      return next;
    });
  }, []);

  const removeAddressLabel = useCallback((address: string) => {
    setAddressLabelsState((prev) => {
      const { [address]: _, ...next } = prev;
      saveAddressLabels(next);
      return next;
    });
  }, []);

  const getLabel = useCallback(
    (address: string) => addressLabels[address],
    [addressLabels],
  );

  const setBytesEncoding = useCallback(
    (accountType: string, fieldName: string, encoding: BytesDisplayEncoding) => {
      setBytesEncodingsState((prev) => {
        const key = `${accountType}:${fieldName}`;
        return { ...prev, [key]: encoding };
      });
    },
    [setBytesEncodingsState],
  );

  const getBytesEncoding = useCallback(
    (accountType: string, fieldName: string) =>
      bytesEncodings[`${accountType}:${fieldName}`],
    [bytesEncodings],
  );

  const addPdaSearch = useCallback((search: SavedPdaSearch) => {
    setSavedPdaSearches((prev) => [...prev.filter((s) => s.id !== search.id), search]);
  }, [setSavedPdaSearches]);

  const removePdaSearch = useCallback((id: string) => {
    setSavedPdaSearches((prev) => prev.filter((s) => s.id !== id));
  }, [setSavedPdaSearches]);

  const addCollapsedAddress = useCallback((address: string) => {
    setCollapsedAddresses((prev) => {
      if (prev.includes(address)) return prev;
      return [...prev, address];
    });
  }, [setCollapsedAddresses]);

  const removeCollapsedAddress = useCallback((address: string) => {
    setCollapsedAddresses((prev) => prev.filter((a) => a !== address));
  }, [setCollapsedAddresses]);

  const isCollapsedAddress = useCallback(
    (address: string) => collapsedAddresses.includes(address),
    [collapsedAddresses],
  );

  const setExpansionDepth = useCallback((depth: number) => {
    setExpansionDepthState(Math.max(1, Math.min(5, depth)));
  }, [setExpansionDepthState]);

  const exportSettings = useCallback(() => {
    // Strip idl and idlFetchedAt from each program — only export identity
    const strippedPrograms = savedPrograms.map(({ programId, programName }) => ({
      programId,
      programName,
    }));
    // Include history from localStorage
    let history: unknown[] = [];
    try {
      const raw = localStorage.getItem("solana-graph-explorer:history");
      if (raw) history = JSON.parse(raw);
    } catch (err) { console.warn("Failed to load history from localStorage during export", err); }
    return JSON.stringify({
      version: 1,
      rpcEndpointKey,
      customRpcUrl,
      relationshipRules,
      savedPrograms: strippedPrograms,
      addressLabels,
      bytesEncodings,
      savedPdaSearches,
      collapsedAddresses,
      expansionDepth,
      darkMode,
      history,
    }, null, 2);
  }, [rpcEndpointKey, customRpcUrl, relationshipRules, savedPrograms, addressLabels, bytesEncodings, savedPdaSearches, collapsedAddresses, expansionDepth, darkMode]);

  const importSettings = useCallback((json: string) => {
    const data = JSON.parse(json);
    if (data.rpcEndpointKey) setRpcEndpointKey(data.rpcEndpointKey);
    if (data.customRpcUrl) setCustomRpcUrl(data.customRpcUrl);
    if (Array.isArray(data.relationshipRules)) {
      setRelationshipRules(data.relationshipRules);
      saveRules(data.relationshipRules);
    }
    if (Array.isArray(data.savedPrograms)) {
      // Strip any full IDLs from old exports — set idl to null and re-fetch
      const strippedPrograms: ProgramEntry[] = data.savedPrograms.map(
        (p: Record<string, unknown>) => ({
          programId: p.programId as string,
          programName: (p.programName as string) ?? (p.programId as string),
          idl: null,
          idlFetchedAt: undefined,
        }),
      );
      setSavedPrograms(strippedPrograms);
      saveProgramEntries(strippedPrograms);

      // Determine RPC endpoint for re-fetching
      const importedRpcKey = data.rpcEndpointKey ?? rpcEndpointKey;
      const importedCustomUrl = data.customRpcUrl ?? customRpcUrl;
      const rpcUrl =
        importedRpcKey === "custom"
          ? importedCustomUrl
          : (RPC_OPTIONS.find((o) => o.key === importedRpcKey)?.url ?? RPC_OPTIONS[0].url);

      // Re-fetch all IDLs in parallel (fire-and-forget — don't block import)
      Promise.all(
        strippedPrograms.map(async (program) => {
          try {
            const idl = await fetchIdl(program.programId, rpcUrl);
            if (idl) {
              setIdl(program.programId, idl);
              const updatedEntry: ProgramEntry = {
                programId: program.programId,
                programName: idl.metadata?.name ?? program.programName,
                idlFetchedAt: Date.now(),
                idl,
              };
              setSavedPrograms((prev) => {
                const next = prev.map((p) =>
                  p.programId === program.programId ? updatedEntry : p,
                );
                saveProgramEntries(next);
                return next;
              });
            }
          } catch (err) {
            console.warn(`Failed to re-fetch IDL for program ${program.programId} during import`, err);
          }
        }),
      );
    }
    if (data.addressLabels && typeof data.addressLabels === "object") {
      setAddressLabelsState(data.addressLabels);
      saveAddressLabels(data.addressLabels);
    }
    if (data.bytesEncodings && typeof data.bytesEncodings === "object") {
      setBytesEncodingsState(data.bytesEncodings);
    }
    if (Array.isArray(data.savedPdaSearches)) {
      setSavedPdaSearches(data.savedPdaSearches);
    }
    if (Array.isArray(data.collapsedAddresses)) {
      setCollapsedAddresses(data.collapsedAddresses);
    }
    if (typeof data.expansionDepth === "number") {
      setExpansionDepthState(Math.max(1, Math.min(5, data.expansionDepth)));
    }
    if (typeof data.darkMode === "boolean") {
      setDarkModeState(data.darkMode);
    }
    // Import history
    if (Array.isArray(data.history)) {
      localStorage.setItem("solana-graph-explorer:history", JSON.stringify(data.history));
    }
  }, [rpcEndpointKey, customRpcUrl]);

  return (
    <SettingsContext.Provider
      value={{
        rpcEndpoint,
        rpcEndpointKey,
        setRpcEndpointKey,
        customRpcUrl,
        setCustomRpcUrl,
        relationshipRules,
        addRelationshipRule,
        removeRelationshipRule,
        savedPrograms,
        saveProgram,
        removeProgram,
        refreshProgram,
        addressLabels,
        setAddressLabel,
        removeAddressLabel,
        getLabel,
        bytesEncodings,
        setBytesEncoding,
        getBytesEncoding,
        savedPdaSearches,
        addPdaSearch,
        removePdaSearch,
        collapsedAddresses,
        addCollapsedAddress,
        removeCollapsedAddress,
        isCollapsedAddress,
        expansionDepth,
        setExpansionDepth,
        darkMode,
        setDarkMode,
        exportSettings,
        importSettings,
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
