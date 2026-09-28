"use client";

import * as React from "react";

/** Estimate menus may unmount their opener when entering edit mode. */
export function useEstimateSheetFocus() {
  const opener = React.useRef<HTMLElement | null>(null);
  const pathname = React.useRef("");
  return {
    onOpenAutoFocus() {
      pathname.current = window.location.pathname;
      const active = document.activeElement;
      const menu = active instanceof HTMLElement ? active.closest('[role="menu"]') : null;
      const triggerId = menu?.getAttribute("aria-labelledby");
      opener.current = triggerId
        ? document.getElementById(triggerId)
        : active instanceof HTMLElement
          ? active
          : null;
    },
    onCloseAutoFocus(event: Event) {
      event.preventDefault();
      window.requestAnimationFrame(() => {
        if (window.location.pathname !== pathname.current) return;
        // A newly opened dialog owns focus; an old close must never steal it.
        if (document.querySelector('[role="dialog"][data-state="open"]')) return;
        const header = document.querySelector('[data-estimate-workspace-header="true"]');
        const candidates = [
          opener.current,
          ...Array.from(
            header?.querySelectorAll<HTMLElement>(
              'button[aria-label="Estimate actions"], button[aria-label="More estimate actions"]'
            ) ?? []
          ),
          ...Array.from(header?.querySelectorAll<HTMLElement>("button") ?? []),
          ...Array.from(header?.querySelectorAll<HTMLElement>("a[href]") ?? []),
        ];
        for (const target of candidates) {
          if (
            !target?.isConnected ||
            !target.getClientRects().length ||
            target.matches(':disabled, [aria-disabled="true"], body') ||
            target.closest('[inert], [aria-hidden="true"], [data-state="closed"][role="menu"]') ||
            getComputedStyle(target).visibility !== "visible"
          )
            continue;
          target.focus({ preventScroll: true });
          if (document.activeElement === target) return;
        }
      });
    },
  };
}
