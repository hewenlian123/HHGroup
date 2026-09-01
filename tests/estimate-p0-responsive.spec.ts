import { expect, test, type Page, type TestInfo } from "./estimate-playwright-test";

import { E2E_PRESERVED_ESTIMATE_ID } from "./e2e-cleanup-db";
import { gotoWithE2EAuth, loginAsE2EOwner } from "./e2e-auth-owner";

const VIEWPORTS = [
  { name: "desktop-1440", width: 1440, height: 1000 },
  { name: "desktop-1280", width: 1280, height: 900 },
  { name: "ipad-landscape", width: 1180, height: 820 },
  { name: "ipad-portrait", width: 820, height: 1180 },
  { name: "mobile-390", width: 390, height: 844 },
] as const;

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const root = document.documentElement;
        const app = document.querySelector<HTMLElement>("[data-app-scroll-root]");
        return Math.max(
          root.scrollWidth - root.clientWidth,
          app ? app.scrollWidth - app.clientWidth : 0
        );
      })
    )
    .toBe(0);
}

async function capture(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: false });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

for (const viewport of VIEWPORTS) {
  test(`${viewport.name} keeps New and Existing Estimate workspaces usable`, async ({
    page,
  }, testInfo) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await loginAsE2EOwner(page, "/estimates/new");
    await expect(page.getByRole("heading", { name: "New Estimate" })).toBeVisible({
      timeout: 30_000,
    });

    await page
      .getByRole("button", { name: /^Add Section$/i })
      .first()
      .click();
    await page.getByRole("menuitem", { name: "Blank section" }).click();
    const addDetails = page.getByRole("button", { name: /^Edit line item \d+:/ }).first();
    if (await addDetails.isVisible().catch(() => false)) await addDetails.click();

    const unit = page
      .getByLabel("Line item 1 unit", { exact: true })
      .locator("visible=true")
      .first();
    await expect(unit).toBeVisible();
    await expect(page.getByRole("button", { name: "Save & Preview" }).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await expect(page.getByTestId("estimate-template-selector")).toBeVisible();
    const workspaceTheme = await page.locator(".estimate-builder").evaluate((builder) => ({
      background: getComputedStyle(builder).backgroundColor,
      colorScheme: getComputedStyle(builder).colorScheme,
    }));
    expect(workspaceTheme.background).toBe("rgb(247, 247, 248)");
    expect(workspaceTheme.colorScheme).toBe("light");
    if (viewport.width === 390) {
      await page.mouse.move(0, 0);
      const mobileCardStyle = await page
        .locator(".eb-line-item-mobile-summary")
        .evaluate((card) => {
          const style = getComputedStyle(card);
          return { background: style.backgroundColor, opacity: style.opacity };
        });
      const channels =
        mobileCardStyle.background
          .match(/[\d.]+/g)
          ?.slice(0, 3)
          .map(Number) ?? [];
      expect(channels).toHaveLength(3);
      expect(Math.min(...channels)).toBeGreaterThanOrEqual(240);
      expect(mobileCardStyle.opacity).toBe("1");
    }
    if (viewport.width < 768) {
      const box = await unit.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    await capture(page, testInfo, `${viewport.name}-new-estimate`);

    await gotoWithE2EAuth(page, `/estimates/${E2E_PRESERVED_ESTIMATE_ID}`);
    await expect(page.getByTestId("estimate-detail-header")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByRole("button", { name: "Save & Preview" }).first()).toBeVisible();
    const visiblePersistedItems = page
      .locator("[data-estimate-line-item-id]")
      .locator("visible=true");
    if (viewport.width >= 768 && (await visiblePersistedItems.count()) > 0) {
      await expect(
        page.getByRole("button", { name: /Drag to reorder line item/ }).first()
      ).toBeVisible();
    } else {
      await expect(page.getByRole("button", { name: /Drag to reorder line item/ })).toHaveCount(0);
    }
    await expectNoHorizontalOverflow(page);
    if (viewport.width >= 1200) {
      const globalNav = page.locator("[data-app-sidebar] [data-sidebar-navigation]");
      await expect(globalNav).toBeVisible();
      await expect(
        page.getByRole("navigation", { name: "Estimate workspace navigation" })
      ).toHaveCount(0);
      await expect(globalNav.getByRole("link", { name: "Estimates", exact: true })).toHaveAttribute(
        "aria-current",
        "page"
      );
      for (const section of [
        "DASHBOARD",
        "PROJECTS",
        "FINANCIAL",
        "DIRECTORY",
        "REPORTS",
        "DOCUMENTS",
        "SETTINGS",
      ]) {
        await expect(globalNav.getByRole("button", { name: section, exact: true })).toBeVisible();
      }
      await expect(globalNav.getByText("Admin Center", { exact: true })).toBeVisible();

      const geometry = await page.evaluate(() => {
        const box = (selector: string) => {
          const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
          return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;
        };
        return {
          sidebar: box("[data-app-sidebar]"),
          header: box(".eb-estimate-command-bar"),
          outline: box(".eb-section-outline"),
          inspector: box(".eb-pricing-summary-strip"),
        };
      });
      expect(geometry.sidebar?.width).toBe(216);
      expect(geometry.header?.height).toBe(104);
      expect(geometry.header?.y).toBe(0);
      expect(geometry.outline).toBeNull();
      expect(geometry.inspector?.width).toBe(360);
    }
    await capture(page, testInfo, `${viewport.name}-existing-estimate`);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
}

test("Desktop Global Sidebar stays consistent across Dashboard, Estimate Detail, and Projects", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAsE2EOwner(page, "/dashboard");

  const globalNav = page.locator("[data-app-sidebar] [data-sidebar-navigation]");
  await expect(globalNav).toBeVisible({ timeout: 30_000 });
  const sidebar = page.locator("[data-app-sidebar]");
  const dashboardWidth = (await sidebar.boundingBox())?.width;
  const dashboardLabels = await globalNav.getByRole("link").allTextContents();

  await globalNav.getByRole("link", { name: "Estimates", exact: true }).click();
  await expect(page).toHaveURL(/\/estimates(?:\?|$)/);
  await page.locator(`a[href="/estimates/${E2E_PRESERVED_ESTIMATE_ID}"]:visible`).click();
  await expect(page.getByTestId("estimate-detail-header")).toBeVisible({ timeout: 30_000 });
  await expect(globalNav.getByRole("link", { name: "Estimates", exact: true })).toHaveAttribute(
    "aria-current",
    "page"
  );
  expect((await sidebar.boundingBox())?.width).toBe(dashboardWidth);
  expect(await globalNav.getByRole("link").allTextContents()).toEqual(dashboardLabels);

  await globalNav.getByRole("link", { name: "Projects", exact: true }).click();
  await expect(page).toHaveURL(/\/projects(?:\?|$)/);
  await page.waitForLoadState("networkidle");
  await expect(globalNav.getByRole("link", { name: "Projects", exact: true })).toHaveAttribute(
    "aria-current",
    "page"
  );
  expect((await sidebar.boundingBox())?.width).toBe(dashboardWidth);
  expect(await globalNav.getByRole("link").allTextContents()).toEqual(dashboardLabels);

  await globalNav.getByRole("link", { name: "Estimates", exact: true }).click();
  await expect(page).toHaveURL(/\/estimates(?:\?|$)/);
  await page.locator(`a[href="/estimates/${E2E_PRESERVED_ESTIMATE_ID}"]:visible`).click();
  await expect(page.getByTestId("estimate-detail-header")).toBeVisible({ timeout: 30_000 });
  await expect(globalNav.getByRole("link", { name: "Estimates", exact: true })).toHaveAttribute(
    "aria-current",
    "page"
  );
  await page.waitForLoadState("networkidle");
  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, "desktop-1440-global-sidebar-navigation");
});

test("Desktop and portrait Estimate workspaces retain the status pill and row-density contract", async ({
  page,
}, testInfo) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  const verifyDensity = async (
    viewport: { name: string; width: number; height: number },
    expected: { gridHeader: number; sectionHeader: number; lineRow: number }
  ) => {
    await page.setViewportSize(viewport);
    await loginAsE2EOwner(page, "/estimates/new");
    await expect(page.getByRole("heading", { name: "New Estimate" })).toBeVisible({
      timeout: 30_000,
    });

    await page
      .getByRole("button", { name: /^Add Section$/i })
      .first()
      .click();
    await page.getByRole("menuitem", { name: "Blank section" }).click();
    const addDetails = page.getByRole("button", { name: /^Edit line item \d+:/ }).first();
    if (await addDetails.isVisible().catch(() => false)) await addDetails.click();
    await expect(page.locator(".eb-scope-section-lines .eb-line-item-card").first()).toBeVisible();

    const status = await page
      .locator('[data-estimate-workspace-header="true"]')
      .getByText("Draft", { exact: true })
      .evaluate((badge) => {
        const style = getComputedStyle(badge);
        return {
          height: style.height,
          radius: style.borderRadius,
          fontSize: style.fontSize,
          lineHeight: style.lineHeight,
          fontWeight: style.fontWeight,
          letterSpacing: style.letterSpacing,
        };
      });
    expect(status).toEqual({
      height: "26px",
      radius: "999px",
      fontSize: "11px",
      lineHeight: "14px",
      fontWeight: "500",
      letterSpacing: "0.2px",
    });

    const geometry = await page.evaluate(() => {
      const height = (selector: string) =>
        Array.from(document.querySelectorAll<HTMLElement>(selector))
          .find((element) => element.getClientRects().length > 0)
          ?.getBoundingClientRect().height;
      return {
        gridHeader: height('[data-testid="estimate-line-item-grid-header"]'),
        sectionHeader: height(".eb-scope-section-header"),
        lineRow: height(".eb-scope-section-lines .eb-line-item-card"),
      };
    });
    expect(geometry.gridHeader).toBe(expected.gridHeader);
    expect(geometry.sectionHeader).toBe(expected.sectionHeader);
    expect(geometry.lineRow ?? 0).toBeGreaterThanOrEqual(expected.lineRow);

    if (viewport.width === 820) {
      const compactGrid = await page.evaluate(() => {
        const visibleRect = (selector: string) => {
          const element = Array.from(document.querySelectorAll<HTMLElement>(selector)).find(
            (candidate) => candidate.getClientRects().length > 0
          );
          if (!element) return null;
          const { bottom, height, left, right, top, width } = element.getBoundingClientRect();
          return { bottom, height, left, right, top, width };
        };
        const intersectsByMoreThanOnePixel = (
          first: { bottom: number; left: number; right: number; top: number },
          second: { bottom: number; left: number; right: number; top: number }
        ) =>
          Math.min(first.right, second.right) - Math.max(first.left, second.left) > 1 &&
          Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top) > 1;
        const header = document.querySelector<HTMLElement>(
          '[data-testid="estimate-line-item-grid-header"]'
        );
        const headerRect = header?.getBoundingClientRect();
        const headerCells = header
          ? Array.from(header.children)
              .map((cell) => cell.getBoundingClientRect())
              .filter((cell) => cell.width > 0 && cell.height > 0)
              .map(({ bottom, height, left, right, top, width }) => ({
                bottom,
                height,
                left,
                right,
                top,
                width,
              }))
          : [];
        const rowColumns = [
          ".eb-line-item-index-control",
          ".eb-line-title-input-wrap",
          ".eb-line-qty-unit-group",
          ".eb-line-pricing-unit",
          ".eb-line-pricing-total-col",
        ]
          .map((selector) => ({ selector, rect: visibleRect(selector) }))
          .filter(
            (column): column is { selector: string; rect: NonNullable<typeof column.rect> } =>
              column.rect !== null
          );
        const gridTrackCount = (element: HTMLElement | null) =>
          element ? getComputedStyle(element).gridTemplateColumns.split(" ").length : 0;
        const root = document.documentElement;
        const editorRoot = document.querySelector<HTMLElement>("[data-estimate-editor-mode]");
        const rowGrid = document.querySelector<HTMLElement>(".eb-line-item-grid--pricing");
        const rowGridRect = rowGrid?.getBoundingClientRect();
        const rowGridStyle = rowGrid ? getComputedStyle(rowGrid) : null;
        const rowTrackWidths = rowGridStyle
          ? rowGridStyle.gridTemplateColumns.split(" ").map(Number.parseFloat)
          : [];
        const rowGap = rowGridStyle ? Number.parseFloat(rowGridStyle.columnGap) : 0;
        const rowContentStart =
          rowGridRect && rowGridStyle
            ? rowGridRect.left + Number.parseFloat(rowGridStyle.paddingLeft)
            : 0;
        const rowTrackBounds = rowTrackWidths.reduce<Array<{ left: number; right: number }>>(
          (bounds, width) => {
            const left = bounds.length ? bounds[bounds.length - 1].right + rowGap : rowContentStart;
            bounds.push({ left, right: left + width });
            return bounds;
          },
          []
        );

        return {
          headerHasFiveTracks: gridTrackCount(header) === 5,
          rowHasFiveTracks: gridTrackCount(rowGrid) === 5,
          headerCellsWithinHeader:
            headerRect !== undefined &&
            headerRect !== null &&
            headerCells.length === 5 &&
            headerCells.every(
              (cell) =>
                cell.left >= headerRect.left &&
                cell.right <= headerRect.right &&
                cell.top >= headerRect.top &&
                cell.bottom <= headerRect.bottom
            ),
          headerOrderedWithoutIntersection: headerCells.every(
            (cell, index) =>
              index === 0 ||
              (cell.left >= headerCells[index - 1].right - 1 &&
                !intersectsByMoreThanOnePixel(cell, headerCells[index - 1]))
          ),
          rowColumnsOrderedWithoutIntersection:
            rowColumns.length === 5 &&
            rowColumns.every(
              (column, index) =>
                index === 0 ||
                (column.rect.left >= rowColumns[index - 1].rect.right - 1 &&
                  !intersectsByMoreThanOnePixel(column.rect, rowColumns[index - 1].rect))
            ),
          rowCellContentWithinTracks:
            rowColumns.length === 5 &&
            rowColumns.every(
              (column, index) =>
                column.rect.left >= rowTrackBounds[index].left - 1 &&
                column.rect.right <= rowTrackBounds[index].right + 1
            ),
          pageAndBuilderHaveNoHorizontalOverflow:
            root.scrollWidth <= root.clientWidth &&
            (!editorRoot || editorRoot.scrollWidth <= editorRoot.clientWidth),
          rowColumnRects: rowColumns,
          rowTrackBounds,
        };
      });
      await testInfo.attach("portrait-820-grid-rects", {
        body: JSON.stringify(compactGrid.rowColumnRects, null, 2),
        contentType: "application/json",
      });
      expect(
        compactGrid.rowColumnsOrderedWithoutIntersection,
        JSON.stringify(compactGrid.rowColumnRects, null, 2)
      ).toBe(true);
      expect(
        compactGrid.rowCellContentWithinTracks,
        JSON.stringify(
          { rowColumns: compactGrid.rowColumnRects, rowTrackBounds: compactGrid.rowTrackBounds },
          null,
          2
        )
      ).toBe(true);
      expect(compactGrid).toMatchObject({
        headerHasFiveTracks: true,
        rowHasFiveTracks: true,
        headerCellsWithinHeader: true,
        headerOrderedWithoutIntersection: true,
        pageAndBuilderHaveNoHorizontalOverflow: true,
      });
    }
    await capture(page, testInfo, `task-2-${viewport.name}-density`);
  };

  await verifyDensity(
    { name: "desktop-1440", width: 1440, height: 1000 },
    { gridHeader: 36, sectionHeader: 44, lineRow: 68 }
  );
  await verifyDensity(
    { name: "portrait-820", width: 820, height: 1180 },
    { gridHeader: 44, sectionHeader: 44, lineRow: 68 }
  );

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
