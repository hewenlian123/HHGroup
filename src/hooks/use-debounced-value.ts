"use client";

import { useEffect, useState } from "react";

/**
 * Returns a debounced value that updates after `delayMs` of no changes.
 * Keeps filter updates minimal and avoids re-renders on every keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);

  return debounced;
}
