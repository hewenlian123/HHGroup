"use client";
import { useCallback, useEffect, type SetStateAction } from "react";
import { useSearchParams } from "next/navigation";

/** URL-owned presentation state. Merge against the live URL so batched filter updates coexist. */
export function useFinanceQueryState<T extends string = string>(key: string, initial: string) {
  const params = useSearchParams();
  const value = (params.get(key) ?? initial) as T;
  const setValue = useCallback(
    (next: SetStateAction<T>) => {
      const url = new URL(window.location.href);
      const previous = (url.searchParams.get(key) ?? initial) as T;
      const resolved = typeof next === "function" ? next(previous) : next;
      if (resolved === previous) return;
      if (resolved) url.searchParams.set(key, resolved);
      else url.searchParams.delete(key);
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    },
    [key, initial]
  );
  return [value, setValue] as const;
}

/** Restore keyboard/visual position only after the source list has loaded. */
export function useFinanceRecordFocus(ready: boolean) {
  const params = useSearchParams();
  const selected = params.get("selectedRecord");
  useEffect(() => {
    if (!ready || !selected) return;
    const elements = document.querySelectorAll<HTMLElement>("[data-finance-record]");
    const element = Array.from(elements).find(
      (node) => node.dataset.financeRecord === selected && node.getClientRects().length > 0
    );
    if (element) {
      element.focus({ preventScroll: true });
      element.scrollIntoView({ block: "nearest" });
    }
  }, [ready, selected]);
}
