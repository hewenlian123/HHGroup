import { expect, test, type Page } from "@playwright/test";

import { loginAsE2EOwner } from "./e2e-auth-owner";

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 900 },
  { width: 1180, height: 820 },
  { width: 820, height: 900 },
  { width: 390, height: 844 },
] as const;

async function stubSafeReads(page: Page) {
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
  await page.route("**/api/operations/site-photos**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ok: true, photos: [], projects: [] }),
    })
  );
  await page.route("**/api/operations/inspection-log", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ok: true, entries: [], projects: [] }),
    })
  );
}

async function expectNoHorizontalOverflow(page: Page, route: string, width: number) {
  const widths = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(widths.scroll, `${route} at ${width}px: ${JSON.stringify(widths)}`).toBeLessThanOrEqual(
    widths.client + 1
  );
}

test("Batch 4 routes stay error-free and responsive under accessibility media", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      const location = message.location();
      consoleErrors.push(`${message.text()} @ ${location.url}:${location.lineNumber}`);
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await stubSafeReads(page);

  type RouteSpec = {
    path: string;
    heading: string;
    tabletTarget?: string;
    mobileTarget?: string;
  };

  const routes: readonly RouteSpec[] = [
    { path: "/tasks", heading: "Tasks", tabletTarget: "+ New Task", mobileTarget: "New task" },
    {
      path: "/schedule",
      heading: "Schedule",
      tabletTarget: "+ New schedule item",
      mobileTarget: "New schedule item",
    },
    {
      path: "/punch-list",
      heading: "Punch List",
      tabletTarget: "+ Add Issue",
      mobileTarget: "Add issue",
    },
    {
      path: "/site-photos",
      heading: "Site Photos",
      tabletTarget: "+ Upload Photo",
      mobileTarget: "Upload photo",
    },
    {
      path: "/inspection-log",
      heading: "Inspection Log",
      tabletTarget: "+ New Inspection",
      mobileTarget: "New inspection",
    },
    {
      path: "/materials",
      heading: "Material Selections",
      tabletTarget: "New Selection",
      mobileTarget: "New Selection",
    },
    { path: "/estimating/cost-codes", heading: "Cost Codes" },
    { path: "/procurement/purchase-orders", heading: "Purchase Orders" },
  ];

  for (const route of routes) {
    await loginAsE2EOwner(page, route.path);
    await expect(page.getByRole("heading", { name: route.heading, exact: true })).toBeVisible();

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await expectNoHorizontalOverflow(page, route.path, viewport.width);
    }

    if (route.tabletTarget && route.mobileTarget) {
      await page.setViewportSize({ width: 820, height: 900 });
      const tabletTarget = page
        .getByRole("button", { name: route.tabletTarget, exact: true })
        .or(page.getByRole("link", { name: route.tabletTarget, exact: true }));
      await tabletTarget.focus();
      await expect(tabletTarget).toBeFocused();
      expect(
        (await tabletTarget.boundingBox())?.height,
        `${route.path} tablet target`
      ).toBeGreaterThanOrEqual(44);

      await page.setViewportSize({ width: 390, height: 844 });
      const mobileTarget = page
        .getByLabel(route.mobileTarget)
        .or(page.getByRole("link", { name: route.mobileTarget, exact: true }));
      await mobileTarget.focus();
      await expect(mobileTarget).toBeFocused();
      expect(
        (await mobileTarget.boundingBox())?.height,
        `${route.path} mobile target`
      ).toBeGreaterThanOrEqual(44);
    }

    await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
    await expect(page.getByRole("heading", { name: route.heading, exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page, `${route.path} forced colors`, 390);
    await page.emulateMedia({ forcedColors: "none", reducedMotion: "no-preference" });
    expect(pageErrors, `${route.path} page errors`).toEqual([]);
    expect(consoleErrors, `${route.path} console errors`).toEqual([]);
  }
});
