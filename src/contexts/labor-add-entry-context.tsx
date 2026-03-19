"use client";

import * as React from "react";

type LaborAddEntryContextValue = {
  /** Labor page registers `() => setModalOpen(true)` while mounted. */
  registerOpenDailyEntry: (fn: (() => void) | null) => void;
  /** FAB / quick actions: opens the same modal as "+ Add Entry" on /labor when that page is active. */
  triggerOpenDailyEntry: () => void;
};

const LaborAddEntryContext = React.createContext<LaborAddEntryContextValue | null>(null);

export function LaborAddEntryProvider({ children }: { children: React.ReactNode }) {
  const openRef = React.useRef<(() => void) | null>(null);

  const registerOpenDailyEntry = React.useCallback((fn: (() => void) | null) => {
    openRef.current = fn;
  }, []);

  const triggerOpenDailyEntry = React.useCallback(() => {
    openRef.current?.();
  }, []);

  const value = React.useMemo(
    () => ({ registerOpenDailyEntry, triggerOpenDailyEntry }),
    [registerOpenDailyEntry, triggerOpenDailyEntry]
  );

  return (
    <LaborAddEntryContext.Provider value={value}>{children}</LaborAddEntryContext.Provider>
  );
}

export function useLaborAddEntry() {
  return React.useContext(LaborAddEntryContext);
}

/** Call from Labor page only: wires FAB quick action to the existing Add Daily Entry modal. */
export function useRegisterLaborOpenDailyEntry(openDailyEntry: () => void) {
  const ctx = useLaborAddEntry();
  React.useEffect(() => {
    if (!ctx) return;
    ctx.registerOpenDailyEntry(openDailyEntry);
    return () => ctx.registerOpenDailyEntry(null);
  }, [ctx, openDailyEntry]);
}
