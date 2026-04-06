"use client";

import { startTransition } from "react";
import { syncRouterAndClients, type MinimalAppRouter } from "@/lib/sync-router-client";

export type { MinimalAppRouter };

/** Runs `syncRouterAndClients` inside `startTransition` so the main thread stays responsive. */
export function syncRouterNonBlocking(router: MinimalAppRouter, reason?: string): void {
  startTransition(() => {
    void syncRouterAndClients(router, reason);
  });
}

/** Next.js `router.refresh()` only — use when a full `hh:app-sync` dispatch must be avoided. */
export function refreshRscNonBlocking(router: MinimalAppRouter): void {
  startTransition(() => {
    void Promise.resolve(router.refresh());
  });
}
