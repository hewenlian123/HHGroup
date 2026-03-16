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
  };
  return withPWA(base);
}
