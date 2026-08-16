import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";

import { loadE2EProcessEnv } from "./tests/e2e-load-env";

loadE2EProcessEnv();

const baseURL = (process.env.E2E_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const storageState = process.env.E2E_UI_STORAGE_STATE?.trim();

function isLocalUiBase(value: string) {
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      ["localhost", "127.0.0.1"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

if (!isLocalUiBase(baseURL)) {
  throw new Error("[ui-readonly] E2E_BASE_URL must use localhost or 127.0.0.1.");
}

if (!storageState) {
  throw new Error(
    "[ui-readonly] E2E_UI_STORAGE_STATE must point to an existing pre-authenticated local browser storage-state file. This suite does not create users or sessions."
  );
}

const resolvedStorageState = resolve(process.cwd(), storageState);
if (!existsSync(resolvedStorageState)) {
  throw new Error(`[ui-readonly] Storage-state file does not exist: ${resolvedStorageState}`);
}

function buildReadonlyWebServerEnv(): Record<string, string> {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );

  return {
    ...environment,
    E2E_UI_READONLY: "1",
    NEXT_DIST_DIR: ".next-e2e-ui-readonly",
    SUPABASE_DATABASE_URL: "",
    DATABASE_URL: "",
  };
}

const port = new URL(baseURL).port || "3000";

export default defineConfig({
  testDir: "./tests/ui-readonly",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  outputDir: "test-results/ui-readonly",
  reporter: [["list"], ["html", { outputFolder: "playwright-report/ui-readonly", open: "never" }]],
  use: {
    baseURL,
    storageState: resolvedStorageState,
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm run dev:safe -- -p ${port}`,
    url: `${baseURL}/financial/inbox`,
    reuseExistingServer: false,
    timeout: 300_000,
    env: buildReadonlyWebServerEnv(),
  },
  projects: [{ name: "chromium-ui-readonly", use: { ...devices["Desktop Chrome"] } }],
});
