import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { defineConfig, devices } from "@playwright/test";
import { config as loadDotenv } from "dotenv";

import { loadE2EProcessEnv } from "./tests/e2e-load-env";

/**
 * Base chain: `.env` → `.env.local` → `.env.e2e` → `.env.test` (see tests/e2e-load-env.ts).
 * Load `.env.test` again so local E2E Supabase is explicitly pinned for Playwright even if other tools change order.
 */
loadE2EProcessEnv();
const e2eTestEnvPath = resolve(process.cwd(), ".env.test");
if (existsSync(e2eTestEnvPath)) {
  loadDotenv({ path: e2eTestEnvPath, override: true });
}

/** Dynamic base URL for local dev (default :3000) or CI override. */
const resolvedBase = (process.env.E2E_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
// Helpers that read process.env.E2E_BASE_URL stay in sync when unset.
if (!process.env.E2E_BASE_URL) {
  process.env.E2E_BASE_URL = resolvedBase;
}

const isLocalE2eBase = /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?$/i.test(resolvedBase);

/**
 * Env passed to `npm run dev` / `next start` when Playwright spawns the webServer.
 * Avoid forcing `SUPABASE_SERVICE_ROLE_KEY=""` — that overrides `.env.local` loaded by Next and makes API routes fall back to anon + RLS.
 */
function buildWebServerEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  const keys = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ] as const;
  for (const key of keys) {
    const raw = env[key];
    if (raw === undefined || String(raw).trim() === "") {
      delete env[key];
    } else {
      env[key] = String(raw).trim();
    }
  }
  return env;
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
    process.env.PW_WORKERS !== undefined
      ? Number(process.env.PW_WORKERS)
      : process.env.CI === "true"
        ? 2
        : 1,
  /**
   * Web server (always on unless `E2E_WEB_SERVER=off`):
   * - `CI=true` (GitHub Actions): `next start` — requires a prior `next build`
   * - Otherwise: `next dev` — default for local/Cursor (`CI=1` is *not* treated as pipeline CI)
   * - `E2E_WEB_SERVER=dev` with `CI=true` forces `next dev` in CI if needed
   * - Readiness uses `/financial/expenses` so a broken dev that only serves `/` is not treated as healthy
   *
   * Port is derived from E2E_BASE_URL (defaults to :3000).
   */
  webServer:
    process.env.E2E_WEB_SERVER === "off" || !isLocalE2eBase
      ? undefined
      : (() => {
          const u = new URL(resolvedBase);
          const port = u.port || "3000";
          const pipelineCi = process.env.CI === "true";
          const forceDev = process.env.E2E_WEB_SERVER === "dev";
          const useStart = pipelineCi && !forceDev;
          /**
           * Default: reuse an already-running dev server on the port (fast local iteration).
           * Set `E2E_PLAYWRIGHT_REUSE_DEV_SERVER=0` to force Playwright to spawn its own server so
           * `buildWebServerEnv()` is applied (fixes `/api/upload-receipt/options` when a manually
           * started `next dev` had no `SUPABASE_SERVICE_ROLE_KEY`). Stop the other process on the port first.
           */
          const reuseExistingServer = pipelineCi
            ? false
            : process.env.E2E_PLAYWRIGHT_REUSE_DEV_SERVER !== "0";
          return {
            command: useStart ? `PORT=${port} npm run start` : `npm run dev:safe -- -p ${port}`,
            url: `${resolvedBase}/financial/expenses`,
            reuseExistingServer,
            timeout: useStart ? 120_000 : 180_000,
            env: buildWebServerEnv(),
          };
        })(),
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
