import {
  createContext,
  useCallback,
  useContext,
  useReducer,
  type ReactNode,
} from "react";

const HISTORY_STORAGE_KEY = "solana-graph-explorer:history";
const MAX_HISTORY_ITEMS = 100;

export interface HistoryItem {
  type: "account" | "transaction";
  id: string;
  label?: string;
  accountType?: string;
  programName?: string;
  timestamp: number;
  blockTime?: number;
  instructionNames?: string[];
}

interface HistoryState {
  items: HistoryItem[];
}

type HistoryAction =
  | { type: "ADD_ITEM"; item: HistoryItem }
  | { type: "CLEAR" };

function loadHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as HistoryItem[];
    }
  } catch {
    // ignore
  }
  return [];
}

function saveHistory(items: HistoryItem[]): void {
  localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(items));
}

function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case "ADD_ITEM": {
      // Remove existing entry with same id (dedup)
      const filtered = state.items.filter((i) => i.id !== action.item.id);
      // Add new item at the front
      const next = [action.item, ...filtered].slice(0, MAX_HISTORY_ITEMS);
      saveHistory(next);
      return { items: next };
    }
    case "CLEAR": {
      saveHistory([]);
      return { items: [] };
    }
  }
}

interface HistoryContextValue {
  history: HistoryItem[];
  addHistoryItem: (item: HistoryItem) => void;
  clearHistory: () => void;
}

const HistoryContext = createContext<HistoryContextValue | null>(null);

export function HistoryProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(historyReducer, { items: loadHistory() });

  const addHistoryItem = useCallback((item: HistoryItem) => {
    dispatch({ type: "ADD_ITEM", item });
  }, []);

  const clearHistory = useCallback(() => {
    dispatch({ type: "CLEAR" });
  }, []);

  return (
    <HistoryContext.Provider
      value={{
        history: state.items,
        addHistoryItem,
        clearHistory,
      }}
    >
      {children}
    </HistoryContext.Provider>
  );
}

export function useHistory(): HistoryContextValue {
  const ctx = useContext(HistoryContext);
  if (!ctx) {
    throw new Error("useHistory must be used within a HistoryProvider");
  }
  return ctx;
}
