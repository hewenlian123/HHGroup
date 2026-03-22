"use client";

/**
 * System-wide data sync after mutations (create / update / delete).
 *
 * 1. `router.refresh()` — revalidates Next.js App Router RSC payloads (server components + server-fed props).
 * 2. `hh:app-sync` event — lets client-only pages refetch Supabase/API data without a full navigation.
 *
 * Use `syncRouterAndClients(router)` everywhere you previously called `router.refresh()` so behavior stays consistent.
 */
export const HH_APP_SYNC_EVENT = "hh:app-sync";

export type AppSyncDetail = { reason?: string; at: number };

/**
 * Dispatched after an optimistic project edit on the detail page.
 * `ProjectDetailTabsClient` skips `router.refresh()` for this reason so the UI stays snappy;
 * other surfaces (e.g. projects list) still refresh as usual.
 */
export const HH_PROJECT_EDIT_OPTIMISTIC_REASON = "project-edit-optimistic";

export function dispatchClientDataSync(detail?: Partial<AppSyncDetail>) {
  if (typeof window === "undefined") return;
  const payload: AppSyncDetail = { at: Date.now(), ...detail };
  window.dispatchEvent(new CustomEvent(HH_APP_SYNC_EVENT, { detail: payload }));
}

/** Next.js `AppRouterInstance.refresh()` is typed as `void` but may still schedule async work. */
export type MinimalAppRouter = { refresh: () => void | Promise<void> };

export async function syncRouterAndClients(
  router: MinimalAppRouter,
  reason?: string
): Promise<void> {
  await Promise.resolve(router.refresh());
  dispatchClientDataSync({ reason });
}

/** Subscribe to cross-app sync (debounce in the hook, not here). */
export function subscribeAppSync(handler: (ev: Event) => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(HH_APP_SYNC_EVENT, handler);
  return () => window.removeEventListener(HH_APP_SYNC_EVENT, handler);
}
