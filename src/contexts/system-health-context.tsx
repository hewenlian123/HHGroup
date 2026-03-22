"use client";

import * as React from "react";

export type SystemHealthStatus = "ok" | "warning";

type SystemHealthState = {
  status: SystemHealthStatus;
};

type SystemHealthContextValue = {
  systemHealth: SystemHealthState;
  setSystemHealth: (s: SystemHealthState) => void;
};

const SystemHealthContext = React.createContext<SystemHealthContextValue | null>(null);

export function SystemHealthProvider({ children }: { children: React.ReactNode }) {
  const [systemHealth, setSystemHealth] = React.useState<SystemHealthState>({ status: "ok" });
  const value = React.useMemo(() => ({ systemHealth, setSystemHealth }), [systemHealth]);
  return <SystemHealthContext.Provider value={value}>{children}</SystemHealthContext.Provider>;
}

export function useSystemHealth() {
  const ctx = React.useContext(SystemHealthContext);
  if (!ctx) return { systemHealth: { status: "ok" as const }, setSystemHealth: () => {} };
  return ctx;
}
