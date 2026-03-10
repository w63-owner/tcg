import { useEffect, useRef, useState } from "react";

const DEFAULT_DELAY_MS = 400;

/**
 * Returns a debounced value that updates only after `delayMs` of no changes.
 * Useful to avoid triggering API calls or URL updates on every keystroke.
 */
export function useDebounce<T>(value: T, delayMs: number = DEFAULT_DELAY_MS): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      setDebouncedValue(value);
      timeoutRef.current = null;
    }, delayMs);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [value, delayMs]);

  return debouncedValue;
}
