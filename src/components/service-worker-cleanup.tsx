"use client";

import { useEffect } from "react";

/**
 * Remove service workers and Cache Storage left by earlier PWA-enabled releases.
 * This runs in every environment so authenticated API responses cannot remain in
 * a legacy Workbox cache after the service worker integration is retired.
 */
export function ServiceWorkerCleanup() {
  useEffect(() => {
    async function clearLegacyServiceWorkerState() {
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations().catch(() => []);
        await Promise.all(registrations.map((registration) => registration.unregister()));
      }

      if ("caches" in globalThis) {
        const cacheNames = await caches.keys().catch(() => []);
        await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
      }
    }

    void clearLegacyServiceWorkerState().catch(() => undefined);
  }, []);

  return null;
}
