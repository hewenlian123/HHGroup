import { expect, test } from "@playwright/test";

import { addE2EOwnerSession } from "./e2e-auth-owner";
import { e2eTargetOrigin } from "./e2e-env-helpers";

test.use({ javaScriptEnabled: false });

test("dashboard ships the app main and route container without JavaScript", async ({ page }) => {
  await addE2EOwnerSession(page.context(), e2eTargetOrigin());
  const response = await page.goto(`${e2eTargetOrigin()}/dashboard`, {
    waitUntil: "domcontentloaded",
  });

  expect(response?.status()).toBeLessThan(400);
  await expect(page.locator("main[data-app-scroll-root]")).toHaveCount(1);
  await expect(page.locator("main[data-app-scroll-root] .page-container").first()).toBeVisible();
});
