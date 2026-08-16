import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { chromium } from "@playwright/test";

import { addE2EOwnerSession } from "../e2e-auth-owner";
import { loadE2EProcessEnv } from "../e2e-load-env";

loadE2EProcessEnv();

const baseURL = (process.env.E2E_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const outputPath = resolve(
  process.cwd(),
  process.env.E2E_UI_STORAGE_STATE || "tests/.auth/ui-readonly-owner.json"
);
const hostname = new URL(baseURL).hostname;

async function main() {
  if (hostname !== "localhost" && hostname !== "127.0.0.1") {
    throw new Error("[ui-readonly] Owner storage state may only be created for localhost.");
  }

  await mkdir(dirname(outputPath), { recursive: true });

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    await addE2EOwnerSession(context, baseURL);
    await context.storageState({ path: outputPath });
    await context.close();
    console.log(`[ui-readonly] Local owner storage state written: ${outputPath}`);
  } finally {
    await browser.close();
  }
}

void main();
