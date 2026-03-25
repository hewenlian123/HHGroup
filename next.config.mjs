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
