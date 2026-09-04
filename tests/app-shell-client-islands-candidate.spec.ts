import { expect, test, type Page } from "@playwright/test";

import { loginAsE2EOwner } from "./e2e-auth-owner";

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 820, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const;

async function expectScrollUnlocked(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => ({
        body: document.body.style.overflow,
        root: document.documentElement.style.overflow,
        locked: document.body.getAttribute("data-scroll-locked"),
      }))
    )
    .toEqual({ body: "", root: "", locked: null });
}

test.describe("AppShell client-island parity", () => {
  test.describe.configure({ timeout: 180_000 });

  test("authenticated shell, navigation, overlays, focus, and sizing hold at 1440/820/390", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    const serverErrors: string[] = [];
    const context = page.context();
    const attachErrorObservers = (target: Page) => {
      const onPageError = (error: Error) => pageErrors.push(error.message);
      const onConsole = (message: { type(): string; text(): string }) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      };
      const onResponse = (response: { status(): number; url(): string }) => {
        if (response.status() >= 500) serverErrors.push(`${response.status()} ${response.url()}`);
      };
      target.on("pageerror", onPageError);
      target.on("console", onConsole);
      target.on("response", onResponse);
      return () => {
        target.off("pageerror", onPageError);
        target.off("console", onConsole);
        target.off("response", onResponse);
      };
    };
    let detachErrorObservers = attachErrorObservers(page);

    await page.addInitScript(() => {
      window.localStorage.setItem("hh-pwa-install-dismissed", "1");
    });

    for (const viewport of VIEWPORTS) {
      await test.step(viewport.name, async () => {
        await page.setViewportSize(viewport);
        await loginAsE2EOwner(page, "/dashboard");

        const shell = page.locator(".hh-app-shell");
        const main = page.locator("main[data-app-scroll-root]");
        const topbar = page.locator("[data-app-topbar]");
        const sidebar = page.locator("[data-app-sidebar]");
        await expect(shell).toBeVisible({ timeout: 60_000 });
        await expect(main).toBeVisible();
        await expect(topbar).toBeVisible();
        const dimensions = await main.evaluate((element) => ({
          width: element.getBoundingClientRect().width,
          height: element.getBoundingClientRect().height,
        }));
        expect(dimensions.width).toBeGreaterThan(viewport.width * 0.45);
        expect(dimensions.height).toBeGreaterThan(viewport.height * 0.65);

        if (viewport.width < 640) {
          await expect(sidebar).toBeHidden();
          await expect(page.getByRole("navigation", { name: "Bottom navigation" })).toBeVisible();
          await expect(page.getByRole("button", { name: "Open quick actions" })).toBeVisible();

          const menuButton = page.getByRole("button", { name: "Open menu" });
          await menuButton.click();
          const navigationSheet = page.getByRole("dialog", { name: "Navigation menu" });
          await expect(navigationSheet).toBeVisible();
          await page.keyboard.press("Escape");
          await expect(navigationSheet).toBeHidden();
          await expect(menuButton).toBeFocused();

          const fab = page.getByRole("button", { name: "Open quick actions" });
          await fab.click();
          await expect(page.getByRole("dialog", { name: "Quick actions" })).toBeVisible();
          await page.keyboard.press("Escape");
          await expect(fab).toBeFocused();
        } else {
          await expect(sidebar).toBeVisible();
          await expect(page.getByRole("navigation", { name: "Bottom navigation" })).toBeHidden();
          if (viewport.width < 1024) {
            await expect(page.getByRole("button", { name: "Open quick actions" })).toBeVisible();
          } else {
            await expect(page.getByRole("button", { name: "Open quick actions" })).toBeHidden();
          }
        }

        const commandButton = page.getByRole("button", { name: "Open command palette" });
        await commandButton.click();
        const command = page.getByRole("dialog", { name: "Command Palette" });
        await expect(command).toBeVisible();
        await expect(command.locator("xpath=parent::*")).toHaveAttribute(
          "data-hh-portal-host",
          "true"
        );
        await page.keyboard.press("Escape");
        await expect(command).toBeHidden();
        await expect(commandButton).toBeFocused();

        await main.evaluate((element) => {
          const image = document.createElement("img");
          image.alt = "Candidate attachment preview";
          image.tabIndex = 0;
          image.width = 96;
          image.height = 96;
          image.src =
            "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='96'%3E%3Crect width='96' height='96' fill='%23ddd'/%3E%3C/svg%3E";
          image.setAttribute("data-candidate-preview-trigger", "true");
          element.prepend(image);
        });
        const previewTrigger = page.locator("[data-candidate-preview-trigger]");
        await previewTrigger.focus();
        await previewTrigger.click();
        const preview = page.locator("[data-attachment-preview-modal]");
        await expect(preview).toBeVisible();
        expect(await preview.evaluate((element) => getComputedStyle(element).zIndex)).toBe("10000");
        await preview.getByRole("button", { name: "Close" }).click();
        await expect(preview).toBeHidden();
        await expect(previewTrigger).toBeFocused();
        await expectScrollUnlocked(page);
        await page.waitForLoadState("networkidle");
        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
        expect(serverErrors).toEqual([]);

        // Teardown can abort intent-driven RSC prefetches. Detach only after each
        // viewport has independently proven a clean interactive period.
        detachErrorObservers();
        await page.close();
        page = await context.newPage();
        detachErrorObservers = attachErrorObservers(page);
        await page.addInitScript(() => {
          window.localStorage.setItem("hh-pwa-install-dismissed", "1");
        });
      });
    }

    await page.setViewportSize(VIEWPORTS[2]);
    await loginAsE2EOwner(page, "/labor/daily-entry?mode=worker");
    await expect(page.locator("main[data-app-scroll-root]")).toBeVisible({ timeout: 60_000 });
    await expect(page.locator("[data-app-sidebar]")).toHaveCount(0);
    await expect(page.locator("[data-app-topbar]")).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Bottom navigation" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Open quick actions" })).toHaveCount(0);
    const workerEntryDialog = page.getByRole("dialog", { name: "Add Daily Entry" });
    await expect(workerEntryDialog).toBeVisible();
    await workerEntryDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(workerEntryDialog).toBeHidden();
    await expectScrollUnlocked(page);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(serverErrors).toEqual([]);
  });

  test("PWA prompt island mounts inside the authenticated shell", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS[2]);
    await page.addInitScript(() => {
      window.localStorage.removeItem("hh-pwa-install-dismissed");
    });
    await loginAsE2EOwner(page, "/dashboard");
    await expect(page.getByRole("button", { name: "Open command palette" })).toBeVisible({
      timeout: 60_000,
    });
    await page.evaluate(() => {
      const event = new Event("beforeinstallprompt", { cancelable: true });
      Object.defineProperties(event, {
        prompt: { value: async () => undefined },
        userChoice: { value: Promise.resolve({ outcome: "dismissed" }) },
      });
      window.dispatchEvent(event);
    });
    const prompt = page.getByRole("dialog", { name: "Install app" });
    await expect(prompt).toBeVisible({ timeout: 5_000 });
    await prompt.getByRole("button", { name: "Not now" }).click();
    await expect(prompt).toBeHidden();
    await expectScrollUnlocked(page);
  });
});
