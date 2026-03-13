import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
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
const DEFAULT_EXPANSION_DEPTH = 2;

/** Map of "accountType:fieldName" → preferred encoding */
export type BytesEncodings = Record<string, BytesDisplayEncoding>;

export type RpcEndpointKey = "mainnet" | "devnet" | "custom";

interface RpcOption {
  key: RpcEndpointKey;
  label: string;
  url: string;
}

export const RPC_OPTIONS: RpcOption[] = [
  { key: "mainnet", label: "Mainnet Beta", url: "https://solana-rpc.web.helium.io" },
  { key: "devnet", label: "Devnet", url: "https://solana-rpc.web.test-helium.com" },
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
  } catch {
    return [];
  }
}

function saveRules(rules: PdaRelationshipRule[]) {
  localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(rules));
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [rpcEndpointKey, setRpcEndpointKey] = useState<RpcEndpointKey>("mainnet");
  const [customRpcUrl, setCustomRpcUrl] = useState("");
  const [relationshipRules, setRelationshipRules] = useState<PdaRelationshipRule[]>(
    loadRules
  );
  const [savedPrograms, setSavedPrograms] = useState<ProgramEntry[]>(loadSavedPrograms);
  const [addressLabels, setAddressLabelsState] = useState<AddressLabels>(loadAddressLabels);
  const [bytesEncodings, setBytesEncodingsState] = useState<BytesEncodings>(() => {
    try {
      const raw = localStorage.getItem(BYTES_ENCODINGS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const [savedPdaSearches, setSavedPdaSearches] = useState<SavedPdaSearch[]>(() => {
    try {
      const raw = localStorage.getItem(PDA_SEARCHES_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [collapsedAddresses, setCollapsedAddresses] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(COLLAPSED_ADDRESSES_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [expansionDepth, setExpansionDepthState] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(EXPANSION_DEPTH_KEY);
      return raw ? Number(JSON.parse(raw)) : DEFAULT_EXPANSION_DEPTH;
    } catch {
      return DEFAULT_EXPANSION_DEPTH;
    }
  });

  const rpcEndpoint =
    rpcEndpointKey === "custom"
      ? customRpcUrl
      : (RPC_OPTIONS.find((o) => o.key === rpcEndpointKey)?.url ?? RPC_OPTIONS[0].url);

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
        const next = { ...prev, [key]: encoding };
        localStorage.setItem(BYTES_ENCODINGS_KEY, JSON.stringify(next));
        return next;
      });
    },
    [],
  );

  const getBytesEncoding = useCallback(
    (accountType: string, fieldName: string) =>
      bytesEncodings[`${accountType}:${fieldName}`],
    [bytesEncodings],
  );

  const addPdaSearch = useCallback((search: SavedPdaSearch) => {
    setSavedPdaSearches((prev) => {
      const next = [...prev.filter((s) => s.id !== search.id), search];
      localStorage.setItem(PDA_SEARCHES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const removePdaSearch = useCallback((id: string) => {
    setSavedPdaSearches((prev) => {
      const next = prev.filter((s) => s.id !== id);
      localStorage.setItem(PDA_SEARCHES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const addCollapsedAddress = useCallback((address: string) => {
    setCollapsedAddresses((prev) => {
      if (prev.includes(address)) return prev;
      const next = [...prev, address];
      localStorage.setItem(COLLAPSED_ADDRESSES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const removeCollapsedAddress = useCallback((address: string) => {
    setCollapsedAddresses((prev) => {
      const next = prev.filter((a) => a !== address);
      localStorage.setItem(COLLAPSED_ADDRESSES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const isCollapsedAddress = useCallback(
    (address: string) => collapsedAddresses.includes(address),
    [collapsedAddresses],
  );

  const setExpansionDepth = useCallback((depth: number) => {
    const clamped = Math.max(1, Math.min(5, depth));
    setExpansionDepthState(clamped);
    localStorage.setItem(EXPANSION_DEPTH_KEY, JSON.stringify(clamped));
  }, []);

  const exportSettings = useCallback(() => {
    // Strip idl and idlFetchedAt from each program — only export identity
    const strippedPrograms = savedPrograms.map(({ programId, programName }) => ({
      programId,
      programName,
    }));
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
    }, null, 2);
  }, [rpcEndpointKey, customRpcUrl, relationshipRules, savedPrograms, addressLabels, bytesEncodings, savedPdaSearches, collapsedAddresses, expansionDepth]);

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

      // Re-fetch all IDLs in parallel
      for (const program of strippedPrograms) {
        fetchIdl(program.programId, rpcUrl)
          .then((idl) => {
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
          })
          .catch(() => {
            // IDL fetch failed — leave as null
          });
      }
    }
    if (data.addressLabels && typeof data.addressLabels === "object") {
      setAddressLabelsState(data.addressLabels);
      saveAddressLabels(data.addressLabels);
    }
    if (data.bytesEncodings && typeof data.bytesEncodings === "object") {
      setBytesEncodingsState(data.bytesEncodings);
      localStorage.setItem(BYTES_ENCODINGS_KEY, JSON.stringify(data.bytesEncodings));
    }
    if (Array.isArray(data.savedPdaSearches)) {
      setSavedPdaSearches(data.savedPdaSearches);
      localStorage.setItem(PDA_SEARCHES_KEY, JSON.stringify(data.savedPdaSearches));
    }
    if (Array.isArray(data.collapsedAddresses)) {
      setCollapsedAddresses(data.collapsedAddresses);
      localStorage.setItem(COLLAPSED_ADDRESSES_KEY, JSON.stringify(data.collapsedAddresses));
    }
    if (typeof data.expansionDepth === "number") {
      const clamped = Math.max(1, Math.min(5, data.expansionDepth));
      setExpansionDepthState(clamped);
      localStorage.setItem(EXPANSION_DEPTH_KEY, JSON.stringify(clamped));
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
