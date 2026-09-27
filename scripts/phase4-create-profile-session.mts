import { chromium } from "@playwright/test";

const envModule = await import("../tests/e2e-load-env.ts");
const envHelpers = (envModule.default ?? envModule) as typeof import("../tests/e2e-load-env");
envHelpers.loadE2EProcessEnv();
const authModule = await import("../tests/e2e-auth-owner.ts");
const authHelpers = (authModule.default ?? authModule) as typeof import("../tests/e2e-auth-owner");

const baseURL = process.env.HH_PROFILE_BASE_URL ?? "http://127.0.0.1:3000";
const outputPath = process.env.HH_PROFILE_STORAGE_STATE ?? "/private/tmp/hh-phase4-owner.json";

await authHelpers.provisionE2EAuthUsersForRun();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
await authHelpers.addE2EOwnerSession(context, baseURL);
await context.storageState({ path: outputPath });
await browser.close();

console.log(outputPath);
