import { expect, test } from "./fixture";
import { E2E_PRESERVED_PROJECT_ID as projectId } from "../e2e-cleanup-db";

const viewports = [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
] as const;

const representativeRoutes = [
  "/projects",
  "/financial/invoices",
  "/financial/expenses",
  "/financial/inbox",
  "/labor/overview",
  "/customers/overview",
  "/estimates",
] as const;

test("shared motion stays fast, spatial, and reduced-motion safe", async ({ page }) => {
  await page.setViewportSize(viewports[0]);
  await page.goto("/design-system", { waitUntil: "networkidle" });

  const contract = await page.locator("body").evaluate((body) => {
    const styles = getComputedStyle(body);
    const milliseconds = (name: string) => Number.parseFloat(styles.getPropertyValue(name));
    return {
      micro: milliseconds("--hh-motion-micro"),
      fast: milliseconds("--hh-motion-fast"),
      standard: milliseconds("--hh-motion-standard"),
      panel: milliseconds("--hh-motion-panel"),
      easeOut: styles.getPropertyValue("--hh-motion-ease-out").trim(),
    };
  });
  expect(contract.micro).toBeGreaterThanOrEqual(80);
  expect(contract.micro).toBeLessThan(contract.fast);
  expect(contract.fast).toBeLessThanOrEqual(contract.standard);
  expect(contract.standard).toBeLessThanOrEqual(contract.panel);
  expect(contract.panel).toBeLessThan(300);
  expect(contract.easeOut).toMatch(/^cubic-bezier\(/);

  await page.getByRole("button", { name: "Open modal", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect
    .poll(() => dialog.evaluate((element) => getComputedStyle(element).animationName))
    .toContain("hh-dialog-in");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await page.keyboard.press("Control+k");
  const command = page.locator("[data-command-dialog]");
  await expect(command).toBeVisible();
  expect(await command.evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
  await page.keyboard.press("Escape");

  await page.emulateMedia({ reducedMotion: "reduce" });
  const reduced = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.className = "animate-spin transition-transform";
    document.body.append(probe);
    const styles = getComputedStyle(probe);
    const result = {
      animationName: styles.animationName,
      transitionDuration: styles.transitionDuration,
    };
    probe.remove();
    return result;
  });
  expect(reduced.animationName).toBe("none");
  expect(reduced.transitionDuration).toBe("0s");
});

for (const viewport of viewports) {
  test(`motion continuity ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/projects", { waitUntil: "networkidle" });

    const sidebar = page.locator("[data-app-sidebar]:visible").first();
    if (await sidebar.isVisible()) {
      expect(
        await sidebar.evaluate((element) => getComputedStyle(element).transitionProperty)
      ).not.toContain("width");
    }

    await page.goto(`/projects/${projectId}`, { waitUntil: "networkidle" });
    const firstTab = page.getByRole("tab").first();
    if (await firstTab.isVisible()) {
      const indicator = await firstTab.evaluate((element) => {
        const styles = getComputedStyle(element, "::after");
        return { content: styles.content, transitionProperty: styles.transitionProperty };
      });
      expect(indicator.content).not.toBe("none");
      expect(indicator.transitionProperty).toContain("transform");
    }

    await page.goto("/financial/expenses", { waitUntil: "networkidle" });
    const dateTrigger = page
      .getByRole("button", { name: /All time|Last \d+ days|This month/ })
      .first();
    if (await dateTrigger.isVisible()) {
      await dateTrigger.click();
      const popover = page.locator('[data-expense-component-surface="date-filter"]');
      await expect(popover).toBeVisible();
      const origin = await popover.evaluate((element) => {
        const styles = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return {
          actual: styles.transformOrigin,
          center: `${rect.width / 2}px ${rect.height / 2}px`,
        };
      });
      expect(origin.actual).not.toBe(origin.center);

      await page.emulateMedia({ forcedColors: "active" });
      const today = popover.getByRole("button", { name: "Today", exact: true });
      await today.focus();
      const focus = await today.evaluate((element) => {
        const styles = getComputedStyle(element);
        return { matches: element.matches(":focus-visible"), outline: styles.outlineStyle };
      });
      expect(focus.matches).toBe(true);
      expect(focus.outline).not.toBe("none");
    }

    expect(
      await page.evaluate(
        () => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth
      )
    ).toBeLessThanOrEqual(2);
  });
}

test("representative routes stay within layout-shift and main-thread budgets", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize(viewports[0]);
  await page.addInitScript(() => {
    const state = window as typeof window & {
      __hhT5MotionMetrics?: { cls: number; maxLongTask: number };
    };
    state.__hhT5MotionMetrics = { cls: 0, maxLongTask: 0 };
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<
        PerformanceEntry & { value: number; hadRecentInput: boolean }
      >) {
        if (!entry.hadRecentInput) state.__hhT5MotionMetrics!.cls += entry.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        state.__hhT5MotionMetrics!.maxLongTask = Math.max(
          state.__hhT5MotionMetrics!.maxLongTask,
          entry.duration
        );
      }
    }).observe({ type: "longtask", buffered: true });
  });

  for (const route of representativeRoutes) {
    expect((await page.goto(route, { waitUntil: "networkidle" }))?.status(), route).toBe(200);
    await page.waitForTimeout(250);
    const metrics = await page.evaluate(() => {
      const state = window as typeof window & {
        __hhT5MotionMetrics?: { cls: number; maxLongTask: number };
      };
      return state.__hhT5MotionMetrics ?? { cls: 0, maxLongTask: 0 };
    });
    expect(metrics.cls, `${route} CLS`).toBeLessThanOrEqual(0.1);
    expect(metrics.maxLongTask, `${route} longest task`).toBeLessThan(300);
  }
});
