import { defineConfig, devices } from "@playwright/test";

import { loadE2EProcessEnv } from "./e2e-load-env";
import { assertEstimateCertificationLocalOnly } from "./e2e-supabase-url-guard";

loadE2EProcessEnv();

const baseURL = (process.env.E2E_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const parsedBaseURL = new URL(baseURL);
const localHosts = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

if (!localHosts.has(parsedBaseURL.hostname)) {
  throw new Error(
    `Estimate no-repair Playwright config only permits a local app URL; received ${parsedBaseURL.origin}.`
  );
}
if (!process.env.E2E_BASE_URL) {
  process.env.E2E_BASE_URL = baseURL;
}

assertEstimateCertificationLocalOnly({
  baseURL,
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  databaseUrl: process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL,
});

function buildWebServerEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );
}

/** Reusable Estimate QA config: intentionally omits globalSetup/globalTeardown schema repair. */
export default defineConfig({
  testDir: ".",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  retries: 0,
  workers: 1,
  outputDir: "/private/tmp/hh-estimate-no-repair-test-results",
  reporter: "list",
  use: {
    baseURL,
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `PORT=${parsedBaseURL.port} npm run dev:safe -- -p ${parsedBaseURL.port}`,
    url: `${baseURL}/financial/expenses`,
    timeout: 300_000,
    reuseExistingServer: false,
    env: buildWebServerEnv(),
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
