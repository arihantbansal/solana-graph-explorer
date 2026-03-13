import { useState, useCallback, useRef, useEffect } from "react";

interface AsyncActionState<T> {
  isLoading: boolean;
  error: string | null;
  result: T | null;
}

export function useAsyncAction<T = void>() {
  const [state, setState] = useState<AsyncActionState<T>>({
    isLoading: false,
    error: null,
    result: null,
  });
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = useCallback(async (fn: () => Promise<T>): Promise<T | null> => {
    setState({ isLoading: true, error: null, result: null });
    try {
      const result = await fn();
      if (mountedRef.current) {
        setState({ isLoading: false, error: null, result });
      }
      return result;
    } catch (err) {
      if (mountedRef.current) {
        setState({
          isLoading: false,
          error: err instanceof Error ? err.message : "An error occurred",
          result: null,
        });
      }
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setState({ isLoading: false, error: null, result: null });
  }, []);

  const setError = useCallback((error: string | null) => {
    setState((prev) => ({ ...prev, error }));
  }, []);

  return { ...state, run, reset, setError };
}
