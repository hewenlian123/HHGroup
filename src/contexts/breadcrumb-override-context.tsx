"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { findRightmostUuidSegmentIndex } from "@/lib/breadcrumb-path-utils";

type Ctx = {
  /** Key: `${pathname}:${segmentIndex}` */
  overrides: Map<string, string>;
  setOverride: (pathname: string, segmentIndex: number, label: string | null) => void;
};

const BreadcrumbOverrideContext = React.createContext<Ctx | null>(null);

export function BreadcrumbOverrideProvider({ children }: { children: React.ReactNode }) {
  const [overrides, setOverrides] = React.useState(() => new Map<string, string>());

  const setOverride = React.useCallback(
    (pathname: string, segmentIndex: number, label: string | null) => {
      const key = `${pathname}:${segmentIndex}`;
      setOverrides((prev) => {
        const next = new Map(prev);
        if (label == null || label.trim() === "") next.delete(key);
        else next.set(key, label.trim());
        return next;
      });
    },
    []
  );

  const value = React.useMemo(() => ({ overrides, setOverride }), [overrides, setOverride]);

  return (
    <BreadcrumbOverrideContext.Provider value={value}>
      {children}
    </BreadcrumbOverrideContext.Provider>
  );
}

export function useBreadcrumbOverrides(): Ctx {
  const ctx = React.useContext(BreadcrumbOverrideContext);
  if (!ctx) {
    return {
      overrides: new Map(),
      setOverride: () => {},
    };
  }
  return ctx;
}

/**
 * Registers a breadcrumb label for the current pathname’s rightmost UUID segment
 * (e.g. `/workers/[id]`, `/financial/invoices/[id]/print`).
 */
export function useBreadcrumbEntityLabel(label: string | null | undefined) {
  const pathname = usePathname() ?? "";
  const { setOverride } = useBreadcrumbOverrides();

  const segmentIndex = React.useMemo(() => {
    const parts = pathname.split("/").filter(Boolean);
    return findRightmostUuidSegmentIndex(parts);
  }, [pathname]);

  React.useEffect(() => {
    if (!pathname || segmentIndex < 0) return;
    const t = label?.trim();
    if (t) setOverride(pathname, segmentIndex, t);
    else setOverride(pathname, segmentIndex, null);
    return () => setOverride(pathname, segmentIndex, null);
  }, [pathname, segmentIndex, label, setOverride]);
}
