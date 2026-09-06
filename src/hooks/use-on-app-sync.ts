"use client";

import * as React from "react";
import { HH_APP_SYNC_EVENT, type AppSyncDetail } from "@/lib/sync-router-client";

const DEBOUNCE_MS = 80;

/**
 * Re-run `callback` when any part of the app calls `syncRouterAndClients`.
 * Subscribers must never call a global sync producer from this callback; use a local
 * client refetch or `refreshRscNonBlocking` so the event cannot re-broadcast itself.
 * Debounced so burst updates coalesce (e.g. multiple `revalidatePath` + one refresh).
 */
export function useOnAppSync(
  callback: (detail: AppSyncDetail) => void,
  deps: React.DependencyList
): void {
  void deps;
  const cb = React.useRef(callback);
  cb.current = callback;

  React.useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    let latestDetail: AppSyncDetail = { at: 0 };
    const run = (detail: AppSyncDetail) => {
      latestDetail = detail;
      if (t != null) clearTimeout(t);
      t = setTimeout(() => {
        t = null;
        cb.current(latestDetail);
      }, DEBOUNCE_MS);
    };
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<Partial<AppSyncDetail>>).detail;
      run({
        at: typeof detail?.at === "number" ? detail.at : Date.now(),
        reason: detail?.reason,
        refreshScheduled: detail?.refreshScheduled,
      });
    };
    window.addEventListener(HH_APP_SYNC_EVENT, handler);
    return () => {
      window.removeEventListener(HH_APP_SYNC_EVENT, handler);
      if (t != null) clearTimeout(t);
    };
  }, []);
}
