"use client";

import * as React from "react";

export type EstimateInspectorPricing = {
  id: string;
  subtotal: number;
  impact: number;
  adjustment: number;
};

/** Presentation state only. Line values and mutations stay with their existing owner. */
export const EstimateStitchInspectorContext = React.createContext<{
  selected: string | null;
  panelMode: "summary" | "item";
  setPanelMode: React.Dispatch<React.SetStateAction<"summary" | "item">>;
  pricing: EstimateInspectorPricing | null;
  setPricing: React.Dispatch<React.SetStateAction<EstimateInspectorPricing | null>>;
  select: React.Dispatch<React.SetStateAction<string | null>>;
  toolbarHost: HTMLDivElement | null;
  setToolbarHost: React.Dispatch<React.SetStateAction<HTMLDivElement | null>>;
  host: HTMLDivElement | null;
  setHost: React.Dispatch<React.SetStateAction<HTMLDivElement | null>>;
} | null>(null);

export function EstimateStitchInspectorProvider({ children }: { children: React.ReactNode }) {
  const [panelMode, setPanelMode] = React.useState<"summary" | "item">("summary");
  const [selected, select] = React.useState<string | null>(null);
  const [pricing, setPricing] = React.useState<EstimateInspectorPricing | null>(null);
  const [toolbarHost, setToolbarHost] = React.useState<HTMLDivElement | null>(null);
  const [host, setHost] = React.useState<HTMLDivElement | null>(null);
  const value = React.useMemo(
    () => ({
      selected,
      panelMode: selected ? panelMode : "summary",
      setPanelMode,
      select,
      host,
      setHost,
      toolbarHost,
      setToolbarHost,
      pricing: pricing?.id === selected ? pricing : null,
      setPricing,
    }),
    [selected, host, pricing, toolbarHost, panelMode]
  );
  return (
    <EstimateStitchInspectorContext.Provider value={value}>
      {children}
    </EstimateStitchInspectorContext.Provider>
  );
}
