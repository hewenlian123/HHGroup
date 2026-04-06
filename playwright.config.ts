import { resolve } from "node:path";

import { defineConfig, devices } from "@playwright/test";
import { config as loadDotenv } from "dotenv";

/** Same load order as tests/global-setup.ts so `webServer` (next dev/start) sees service role. */
loadDotenv({ path: resolve(process.cwd(), ".env") });
loadDotenv({ path: resolve(process.cwd(), ".env.local"), override: true });

/** Dynamic base URL for local dev (default :3000) or CI override. */
const resolvedBase = (process.env.E2E_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
// Helpers that read process.env.E2E_BASE_URL stay in sync when unset.
if (!process.env.E2E_BASE_URL) {
  process.env.E2E_BASE_URL = resolvedBase;
}

/**
 * Worker-payment + delete-mutation files must **always** have a matching project.
 * If `CI=true` (Cursor/VS Code often sets this) and we omit `chromium-delete-mutations`,
 * those tests match no project and the UI shows them as permanently skipped.
 *
 * CI pipelines should run only safe tests, e.g. `npm run test:e2e:ci` (`--project chromium`).
 * Local full suite: `npm run test:local` runs chromium + chromium-payments + chromium-delete-mutations (see package.json).
 */
const ignorePaymentAndDeleteMutations = [
  /worker-payment.*\.spec\.ts$/,
  /delete-flows-mutations\.spec\.ts$/,
];

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./tests/global-setup.ts",
  globalTeardown: "./tests/global-teardown.ts",
  timeout: 30000,
  retries: 1,
  /**
   * Shared local Supabase state races when chromium + chromium-payments run in parallel (same seed worker).
   * Override with PW_WORKERS=4 for speed when you accept occasional flakes.
   */
  workers:
    process.env.PW_WORKERS !== undefined ? Number(process.env.PW_WORKERS) : process.env.CI ? 2 : 1,
  /**
   * Web server modes:
   * - CI (without E2E_WEB_SERVER=dev): expects build output, runs `next start`
   * - E2E_WEB_SERVER=dev: always runs `next dev` (even if CI=true — Cursor often sets CI)
   *
   * Port is derived from E2E_BASE_URL (defaults to :3000).
   */
  webServer:
    process.env.CI || process.env.E2E_WEB_SERVER === "dev"
      ? (() => {
          const u = new URL(resolvedBase);
          const port = u.port || "3000";
          const isDev = process.env.E2E_WEB_SERVER === "dev";
          return {
            command: isDev ? `npm run dev:safe -- -p ${port}` : `PORT=${port} npm run start`,
            url: resolvedBase,
            reuseExistingServer: !process.env.CI,
            timeout: isDev ? 180_000 : 120_000,
            env: {
              ...process.env,
              NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
              NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
              SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
            },
          };
        })()
      : undefined,
  use: {
    baseURL: (process.env.E2E_BASE_URL || "http://localhost:3000").replace(/\/$/, ""),
    headless: true,
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: ignorePaymentAndDeleteMutations,
    },
    {
      name: "chromium-payments",
      testMatch: /worker-payment.*\.spec\.ts$/,
      timeout: 120_000,
      /** Both specs pay the same seed worker; parallel runs deadlock or leave the Pay dialog stuck. */
      workers: 1,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: resolvedBase,
      },
    },
    {
      name: "chromium-delete-mutations",
      testMatch: /delete-flows-mutations\.spec\.ts$/,
      timeout: 150_000,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: resolvedBase,
      },
    },
  ],
});
