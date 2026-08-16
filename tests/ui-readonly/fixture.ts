import { expect, test as base } from "@playwright/test";

export const UI_READONLY_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const test = base.extend<{ uiReadonlyNetwork: void }>({
  uiReadonlyNetwork: [
    async ({ page }, use) => {
      await page.route("**/*", async (route) => {
        if (UI_READONLY_METHODS.has(route.request().method())) {
          await route.continue();
          return;
        }

        await route.abort("blockedbyclient");
      });

      await use();
    },
    { auto: true },
  ],
});

export { expect };
