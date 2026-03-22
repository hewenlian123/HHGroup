"use client";

import * as React from "react";

type LaborAddEntryContextValue = {
  /** Labor page registers `() => setModalOpen(true)` while mounted. */
  registerOpenDailyEntry: (fn: (() => void) | null) => void;
  /**
   * FAB / quick actions: opens the Add Daily Entry modal when /labor is mounted.
   * @returns true if a handler ran, false if user should navigate (e.g. `/labor?addDaily=1`).
   */
  triggerOpenDailyEntry: () => boolean;
};

const LaborAddEntryContext = React.createContext<LaborAddEntryContextValue | null>(null);

export function LaborAddEntryProvider({ children }: { children: React.ReactNode }) {
  const openRef = React.useRef<(() => void) | null>(null);

  const registerOpenDailyEntry = React.useCallback((fn: (() => void) | null) => {
    openRef.current = fn;
  }, []);

  const triggerOpenDailyEntry = React.useCallback(() => {
    const fn = openRef.current;
    if (fn) {
      fn();
      return true;
    }
    return false;
  }, []);

  const value = React.useMemo(
    () => ({ registerOpenDailyEntry, triggerOpenDailyEntry }),
    [registerOpenDailyEntry, triggerOpenDailyEntry]
  );

  return <LaborAddEntryContext.Provider value={value}>{children}</LaborAddEntryContext.Provider>;
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
