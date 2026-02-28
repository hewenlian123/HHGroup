"use client";

import { useEffect } from "react";

export function AutoprintTrigger({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (enabled && typeof window !== "undefined") {
      window.print();
    }
  }, [enabled]);
  return null;
}
