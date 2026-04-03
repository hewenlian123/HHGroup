"use client";

import { useEffect } from "react";

/**
 * In dev, a service worker registered from a prior prod/preview build can
 * intercept Next chunk URLs and cause ChunkLoadError (timeout / wrong hash).
 */
export function DevUnregisterServiceWorker() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.getRegistrations().then((regs) => {
      for (const r of regs) void r.unregister();
    });
  }, []);
  return null;
}
