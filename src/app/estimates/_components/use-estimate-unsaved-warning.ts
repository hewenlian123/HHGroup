"use client";

import * as React from "react";

const UNSAVED_MESSAGE = "You have unsaved Estimate changes. Leave without saving?";

/** Protects editable Estimate routes without changing router or persistence behavior. */
export function useEstimateUnsavedWarning(active: boolean): void {
  React.useEffect(() => {
    if (!active) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = "";
    };

    const handleDocumentClick = (event: MouseEvent): void => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest<HTMLAnchorElement>("a[href]");
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      if (link.dataset.ignoreUnsavedWarning === "true") return;

      const destination = new URL(link.href, window.location.href);
      const current = new URL(window.location.href);
      if (destination.origin !== current.origin) return;
      if (
        destination.pathname === current.pathname &&
        destination.search === current.search &&
        destination.hash
      ) {
        return;
      }
      if (window.confirm(UNSAVED_MESSAGE)) return;

      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleDocumentClick, true);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleDocumentClick, true);
    };
  }, [active]);
}
