"use client";

import * as React from "react";
import { HH_APP_SYNC_EVENT } from "@/lib/sync-router-client";

const DEBOUNCE_MS = 80;

/**
 * Re-run `callback` when any part of the app calls `syncRouterAndClients` (after RSC refresh).
 * Debounced so burst updates coalesce (e.g. multiple `revalidatePath` + one refresh).
 */
export function useOnAppSync(callback: () => void, deps: React.DependencyList): void {
  void deps;
  const cb = React.useRef(callback);
  cb.current = callback;

  React.useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const run = () => {
      if (t != null) clearTimeout(t);
      t = setTimeout(() => {
        t = null;
        cb.current();
      }, DEBOUNCE_MS);
    };
    const handler = () => run();
    window.addEventListener(HH_APP_SYNC_EVENT, handler);
    return () => {
      window.removeEventListener(HH_APP_SYNC_EVENT, handler);
      if (t != null) clearTimeout(t);
    };
  }, []);
}
