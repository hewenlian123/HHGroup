import { defineConfig, devices } from "@playwright/test";

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
  globalTeardown: "./tests/global-teardown.ts",
  timeout: 30000,
  retries: 1,
  /** CI: build first (`npm run build`), then Playwright starts production server automatically. */
  webServer: process.env.CI
    ? {
        command: "npm run start",
        url: resolvedBase,
        reuseExistingServer: false,
        timeout: 120_000,
      }
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
