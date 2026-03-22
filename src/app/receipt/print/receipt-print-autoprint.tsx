"use client";

import * as React from "react";

/**
 * Opens the browser print dialog once when `?autoprint=1` is present (new tab from Preview / Receipt actions).
 */
export function ReceiptPrintAutoprint({ enabled }: { enabled: boolean }) {
  React.useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    let cancelled = false;
    const raf = window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        if (!cancelled) window.print();
      }, 300);
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
    };
  }, [enabled]);
  return null;
}
