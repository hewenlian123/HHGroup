import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { loginAsE2EOwner } from "./e2e-auth-owner";

async function expectNoHorizontalOverflow(page: Page, width: number) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
    ),
    `${width}px page has no horizontal overflow`
  ).toBe(true);
}

async function stubOperationsReads(page: Page) {
  await page.route("**/api/operations/tasks**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ok: true, tasks: [], projects: [], workers: [] }),
    })
  );
  await page.route("**/api/operations/schedule**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ok: true, schedule: [], projects: [] }),
    })
  );
  await page.route("**/api/operations/punch-list**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        items: [],
        projects: [],
        workers: [],
        summary: { open: 0, assigned: 0, completed: 0 },
      }),
    })
  );
}

test.describe("Operations core global UI", () => {
  test("keeps primary controls touch-safe and keyboard reachable at tablet width", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    await stubOperationsReads(page);

    const routes = [
      {
        path: "/tasks",
        heading: "Tasks",
        primary: "+ New Task",
        mobilePrimary: "New task",
        search: "Search tasks…",
        switcher: "Today",
      },
      {
        path: "/schedule",
        heading: "Schedule",
        primary: "+ New schedule item",
        mobilePrimary: "New schedule item",
        search: "Search schedule",
        switcher: "Calendar",
      },
      {
        path: "/punch-list",
        heading: "Punch List",
        primary: "+ Add Issue",
        mobilePrimary: "Add issue",
        search: "Search punch list",
        switcher: "Kanban Board",
      },
    ] as const;

    for (const route of routes) {
      await page.setViewportSize({ width: 820, height: 1180 });
      await loginAsE2EOwner(page, route.path);
      await expect(page.getByRole("heading", { name: route.heading, exact: true })).toBeVisible({
        timeout: 30_000,
      });

      const primary = page.getByRole("button", { name: route.primary, exact: true });
      const switcher = page.getByRole("button", { name: route.switcher, exact: true });
      const search = page.getByRole("textbox", { name: route.search, exact: true });

      for (const control of [primary, switcher, search]) {
        await expect(control).toBeVisible();
        expect(
          (await control.boundingBox())?.height,
          `${route.path} tablet target`
        ).toBeGreaterThanOrEqual(44);
      }

      await switcher.focus();
      await expect(switcher).toBeFocused();
      await page.keyboard.press("Enter");
      await expectNoHorizontalOverflow(page, 820);

      for (const viewport of [
        { width: 1440, height: 900 },
        { width: 1280, height: 900 },
        { width: 1180, height: 820 },
        { width: 820, height: 1180 },
        { width: 390, height: 844 },
      ]) {
        await page.setViewportSize(viewport);
        await expectNoHorizontalOverflow(page, viewport.width);
      }

      const mobilePrimary = page.getByLabel(route.mobilePrimary, { exact: true });
      await expect(mobilePrimary).toBeVisible();
      expect(
        (await mobilePrimary.boundingBox())?.height,
        `${route.path} mobile target`
      ).toBeGreaterThanOrEqual(44);
      const contrast = await new AxeBuilder({ page })
        .include("main")
        .withRules(["color-contrast"])
        .analyze();
      expect(contrast.violations).toEqual([]);

      await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
      await mobilePrimary.focus();
      const a11yState = await mobilePrimary.evaluate((element) => {
        const styles = getComputedStyle(element);
        return {
          focusVisible: element.matches(":focus-visible"),
          outlineStyle: styles.outlineStyle,
          outlineWidth: Number.parseFloat(styles.outlineWidth),
          forcedColors: matchMedia("(forced-colors: active)").matches,
          reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
          transitionProperty: styles.transitionProperty,
        };
      });
      expect(a11yState.focusVisible).toBe(true);
      expect(a11yState.outlineStyle).not.toBe("none");
      expect(a11yState.outlineWidth).toBeGreaterThan(0);
      expect(a11yState.forcedColors).toBe(true);
      expect(a11yState.reducedMotion).toBe(true);
      expect(a11yState.transitionProperty).not.toContain("all");
      await page.emulateMedia({ forcedColors: "none", reducedMotion: "no-preference" });
    }

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("uses the HH selected surface and retains touch-safe punch dialog fields", async ({
    page,
  }) => {
    await stubOperationsReads(page);
    await page.setViewportSize({ width: 820, height: 1180 });
    await loginAsE2EOwner(page, "/tasks");

    const today = page.getByRole("button", { name: "Today", exact: true });
    await today.click();
    await expect(today).toHaveClass(/bg-\[var\(--hh-l3-selected\)\]/);
    await page.waitForTimeout(200);
    const taskFilterSurface = await today.evaluate((element) => {
      const reference = document.createElement("div");
      reference.className = "bg-[var(--hh-l3-selected)]";
      document.body.append(reference);
      const result = {
        selected: getComputedStyle(element).backgroundColor,
        canonical: getComputedStyle(reference).backgroundColor,
      };
      reference.remove();
      return result;
    });
    expect(taskFilterSurface.selected).toBe(taskFilterSurface.canonical);

    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsE2EOwner(page, "/punch-list");
    const addIssue = page.getByLabel("Add issue", { exact: true });
    await addIssue.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const issueTitle = page.getByPlaceholder("Short title");
    await expect(issueTitle).toBeVisible();
    expect(
      (await issueTitle.boundingBox())?.height,
      "punch issue title mobile target"
    ).toBeGreaterThanOrEqual(44);
    await issueTitle.focus();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(addIssue).toBeFocused();
  });
});
