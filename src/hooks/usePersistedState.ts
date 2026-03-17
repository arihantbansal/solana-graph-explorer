import { useState, useCallback } from "react";

/**
 * Like useState, but initializes from localStorage and persists on every update.
 * Returns [value, setValue] where setValue automatically writes to localStorage.
 */
export function usePersistedState<T>(
  key: string,
  defaultValue: T,
): [T, (updater: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : defaultValue;
    } catch (err) {
      console.warn(`Failed to load persisted state for key "${key}" from localStorage`, err);
      return defaultValue;
    }
  });

  const setPersistedState = useCallback(
    (updater: T | ((prev: T) => T)) => {
      setState((prev) => {
        const next = typeof updater === "function"
          ? (updater as (prev: T) => T)(prev)
          : updater;
        localStorage.setItem(key, JSON.stringify(next));
        return next;
      });
    },
    [key],
  );

  return [state, setPersistedState];
}
