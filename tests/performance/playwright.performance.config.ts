import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { defineConfig, devices } from "@playwright/test";

import { loadE2EProcessEnv } from "../e2e-load-env";
import { PERFORMANCE_VIEWPORTS } from "./performance-result";

loadE2EProcessEnv();

const baseURL = (process.env.E2E_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const storageState = resolve(
  process.cwd(),
  process.env.E2E_PERFORMANCE_STORAGE_STATE || "tests/.auth/ui-readonly-owner.json"
);
const outputDir = resolve(process.cwd(), "test-results/performance");

if (!existsSync(storageState)) {
  throw new Error(
    "[performance] E2E_PERFORMANCE_STORAGE_STATE must reference an existing pre-authenticated browser storage-state file. This probe never creates users or sessions."
  );
}

export default defineConfig({
  testDir: ".",
  testMatch: "hh-system-navigation-performance.spec.ts",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  outputDir,
  reporter: [["list"], ["json", { outputFile: resolve(outputDir, "playwright-report.json") }]],
  use: {
    baseURL,
    storageState,
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: PERFORMANCE_VIEWPORTS[0] } },
    { name: "tablet", use: { ...devices["iPad Pro 11"], viewport: PERFORMANCE_VIEWPORTS[1] } },
    { name: "mobile", use: { ...devices["iPhone 14"], viewport: PERFORMANCE_VIEWPORTS[2] } },
  ],
});
