import {
  createContext,
  useContext,
  useReducer,
  useMemo,
  useCallback,
  type Dispatch,
  type ReactNode,
} from "react";
import type { TransactionViewData } from "@/types/transaction";

export interface ViewState {
  mode: "graph" | "transaction";
  txSignature: string | null;
  txData: TransactionViewData | null;
  txLoading: boolean;
  txError: string | null;
  /** Address to explore after switching back from transaction mode */
  pendingExplore: string | null;
}

export type ViewAction =
  | { type: "OPEN_TRANSACTION"; signature: string }
  | { type: "SET_TX_DATA"; data: TransactionViewData }
  | { type: "SET_TX_ERROR"; error: string }
  | { type: "BACK_TO_GRAPH"; pendingExplore?: string }
  | { type: "CLEAR_PENDING_EXPLORE" };

const initialState: ViewState = {
  mode: "graph",
  txSignature: null,
  txData: null,
  txLoading: false,
  txError: null,
  pendingExplore: null,
};

function viewReducer(state: ViewState, action: ViewAction): ViewState {
  switch (action.type) {
    case "OPEN_TRANSACTION":
      return {
        ...state,
        mode: "transaction",
        txSignature: action.signature,
        txData: null,
        txLoading: true,
        txError: null,
      };
    case "SET_TX_DATA":
      return {
        ...state,
        txData: action.data,
        txLoading: false,
        txError: null,
      };
    case "SET_TX_ERROR":
      return {
        ...state,
        txLoading: false,
        txError: action.error,
      };
    case "BACK_TO_GRAPH":
      return {
        ...state,
        mode: "graph",
        txSignature: null,
        txData: null,
        txLoading: false,
        txError: null,
        pendingExplore: action.pendingExplore ?? null,
      };
    case "CLEAR_PENDING_EXPLORE":
      return {
        ...state,
        pendingExplore: null,
      };
  }
}

interface ViewContextValue {
  state: ViewState;
  dispatch: Dispatch<ViewAction>;
  openTransaction: (signature: string) => void;
  backToGraph: (pendingExplore?: string) => void;
}

const ViewContext = createContext<ViewContextValue | null>(null);

export function ViewProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(viewReducer, initialState);

  const openTransaction = useCallback(
    (signature: string) => {
      const url = new URL(window.location.href);
      url.searchParams.delete("address");
      url.searchParams.set("tx", signature);
      window.history.pushState({}, "", url.toString());
      dispatch({ type: "OPEN_TRANSACTION", signature });
    },
    [dispatch],
  );

  const backToGraph = useCallback((pendingExplore?: string) => {
    const url = new URL(window.location.href);
    url.searchParams.delete("tx");
    if (pendingExplore) {
      url.searchParams.set("address", pendingExplore);
    }
    window.history.pushState({}, "", url.toString());
    dispatch({ type: "BACK_TO_GRAPH", pendingExplore });
  }, [dispatch]);

  const value = useMemo(
    () => ({ state, dispatch, openTransaction, backToGraph }),
    [state, dispatch, openTransaction, backToGraph],
  );

  return (
    <ViewContext.Provider value={value}>{children}</ViewContext.Provider>
  );
}

export function useView(): ViewContextValue {
  const ctx = useContext(ViewContext);
  if (!ctx) {
    throw new Error("useView must be used within a ViewProvider");
  }
  return ctx;
}
