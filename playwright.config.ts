import { defineConfig, devices } from "@playwright/test";

const defaultBase = "http://localhost:3000";
const resolvedBase = (process.env.E2E_BASE_URL || defaultBase).replace(/\/$/, "");
// VS Code / Playwright UI often omit env; helpers read process.env.E2E_BASE_URL — keep in sync with baseURL.
if (!process.env.E2E_BASE_URL) {
  process.env.E2E_BASE_URL = resolvedBase;
}

/**
 * Worker-payment + delete-mutation files must **always** have a matching project.
 * If `CI=true` (Cursor/VS Code often sets this) and we omit `chromium-delete-mutations`,
 * those tests match no project and the UI shows them as permanently skipped.
 *
 * CI pipelines should run only safe tests, e.g. `npm run test:e2e:ci` (`--project chromium`).
 */
const ignorePaymentAndDeleteMutations = [
  /worker-payment.*\.spec\.ts$/,
  /delete-flows-mutations\.spec\.ts$/,
];

export default defineConfig({
  testDir: "./tests",
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
    baseURL: resolvedBase,
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
      timeout: 90_000,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: resolvedBase,
      },
    },
  ],
});
