import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  reloadOnOnline: true,
  cacheOnFrontEndNav: true,
  cacheStartUrl: true,
  dynamicStartUrl: true,
  fallbacks: {
    document: "/offline",
  },
  workboxOptions: {
    navigateFallbackDenylist: [/^\/api\//],
  },
});

export default function nextConfig(phase) {
  const base = {
    // Use single distDir so "rm -rf .next" cleans dev and prod; avoids 404s from stale .next-dev
    distDir: ".next",
    // Worker balances must never be cached at Vercel Edge (stale rows after DB deletes).
    async headers() {
      const workerBalancesNoStore = [
        {
          source: "/api/labor/worker-balances",
          headers: [
            {
              key: "Cache-Control",
              value: "private, no-store, no-cache, max-age=0, must-revalidate",
            },
            { key: "CDN-Cache-Control", value: "no-store" },
            { key: "Vercel-CDN-Cache-Control", value: "no-store" },
          ],
        },
      ];
      if (process.env.NODE_ENV === "development") {
        return [
          ...workerBalancesNoStore,
          {
            source: "/:path*",
            headers: [{ key: "Cache-Control", value: "no-store, no-cache, must-revalidate" }],
          },
        ];
      }
      return workerBalancesNoStore;
    },
    /** `_diag` is not a valid App Router segment (underscore = private folder). Alias for bookmarks/curl. */
    async rewrites() {
      return [
        {
          source: "/api/_diag/upload-receipt-supabase",
          destination: "/api/diag/upload-receipt-supabase",
        },
      ];
    },
    eslint: {
      ignoreDuringBuilds: true,
    },
    // Avoid broken server chunks like `vendor-chunks/@supabase.js` (MODULE_NOT_FOUND) on App Router pages.
    experimental: {
      serverComponentsExternalPackages: [
        "@supabase/supabase-js",
        "@supabase/ssr",
        // Used by ensure-expenses-source-columns; bundling breaks RSC route chunks (webpack __webpack_modules__ error).
        "postgres",
      ],
    },
    // Avoid ENOENT/rename errors in .next/cache/webpack (path with spaces, concurrent access)
    webpack: (config, { dev }) => {
      if (dev) {
        config.cache = { type: "memory" };
      }
      return config;
    },
  };
  return withPWA(base);
}
