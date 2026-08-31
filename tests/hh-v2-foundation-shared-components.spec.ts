import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { loginAsE2EOwner } from "./e2e-auth-owner";

const FIXED_ESTIMATE_ID = "44444444-4444-4444-4444-444444444449";

function collectUnexpectedErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  return errors;
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const root = document.documentElement;
        const app = document.querySelector<HTMLElement>("[data-app-scroll-root]");
        return {
          viewportWidth: root.clientWidth,
          documentScrollWidth: root.scrollWidth,
          appClientWidth: app?.clientWidth ?? null,
          appScrollWidth: app?.scrollWidth ?? null,
          overflow: Math.max(
            root.scrollWidth - root.clientWidth,
            app ? app.scrollWidth - app.clientWidth : 0
          ),
        };
      })
    )
    .toMatchObject({ overflow: 0 });
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: false });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("shared Dialog uses the V2 light scrim and task-title typography", async ({
  page,
}, testInfo) => {
  const errors = collectUnexpectedErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAsE2EOwner(page, "/design-system");

  await page.getByRole("button", { name: "Open modal" }).click();
  const dialog = page.getByRole("dialog", { name: "Modal title" });
  const overlay = page.locator('[data-state="open"].fixed.inset-0.z-50');
  await expect(dialog).toBeVisible();
  await expect(overlay).toHaveCount(1);
  await capture(page, testInfo, "design-system-dialog-desktop-1440");

  const [overlayBackground, titleType] = await Promise.all([
    overlay.evaluate((node) => getComputedStyle(node).backgroundColor),
    dialog.getByRole("heading", { name: "Modal title" }).evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        fontWeight: style.fontWeight,
        letterSpacing: style.letterSpacing,
      };
    }),
  ]);

  expect(overlayBackground).toBe("rgba(24, 26, 30, 0.32)");
  expect(titleType).toEqual({
    fontSize: "16px",
    lineHeight: "22px",
    fontWeight: "600",
    letterSpacing: "normal",
  });
  await expectNoHorizontalOverflow(page);
  expect(errors).toEqual([]);
});

test("shared Tabs default renders an unboxed accent underline", async ({ page }, testInfo) => {
  const errors = collectUnexpectedErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAsE2EOwner(page, "/reports");

  const list = page.getByRole("tablist");
  const active = page.getByRole("tab", { selected: true });
  await expect(list).toBeVisible();
  await expect(active).toBeVisible();
  await capture(page, testInfo, "reports-tabs-desktop-1440");

  const [listStyle, activeStyle] = await Promise.all([
    list.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        background: style.backgroundColor,
        borderTop: style.borderTopWidth,
        radius: style.borderRadius,
      };
    }),
    active.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        background: style.backgroundColor,
        borderBottom: style.borderBottomWidth,
        borderBottomColor: style.borderBottomColor,
        radius: style.borderRadius,
      };
    }),
  ]);

  expect(listStyle).toEqual({
    background: "rgba(0, 0, 0, 0)",
    borderTop: "0px",
    radius: "0px",
  });
  expect(activeStyle).toEqual({
    background: "rgba(0, 0, 0, 0)",
    borderBottom: "2px",
    borderBottomColor: "rgb(37, 99, 235)",
    radius: "0px",
  });
  await expectNoHorizontalOverflow(page);
  expect(errors).toEqual([]);
});

test("Estimate dropdown, Sheet, and DatePicker use the shared V2 light contracts", async ({
  page,
}, testInfo) => {
  test.slow();
  const errors = collectUnexpectedErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAsE2EOwner(page, `/estimates/${FIXED_ESTIMATE_ID}`);

  await page.getByRole("button", { name: "Estimate actions" }).click();
  const menu = page.getByRole("menu");
  const firstItem = menu.getByRole("menuitem").first();
  await expect(menu).toBeVisible();
  await expect(firstItem).toBeVisible();
  await capture(page, testInfo, "estimate-dropdown-desktop-1440");

  const [menuStyle, itemStyle] = await Promise.all([
    menu.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        background: style.backgroundColor,
        radius: style.borderRadius,
      };
    }),
    firstItem.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        height: node.getBoundingClientRect().height,
        radius: style.borderRadius,
      };
    }),
  ]);
  expect(menuStyle).toEqual({ background: "rgb(255, 255, 255)", radius: "6px" });
  expect(itemStyle).toEqual({ height: 40, radius: "6px" });
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: "Edit details", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Customer / project / pricing details" });
  const sheetOverlay = page.locator('[data-state="open"].fixed.inset-0.z-50');
  await expect(sheet).toBeVisible();
  await expect(sheetOverlay).toHaveCount(1);
  await capture(page, testInfo, "estimate-details-sheet-desktop-1440");
  expect(await sheetOverlay.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe(
    "rgba(24, 26, 30, 0.32)"
  );

  const title = sheet.getByRole("heading", {
    name: "Customer / project / pricing details",
    exact: true,
  });
  expect(
    await title.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        fontWeight: style.fontWeight,
        letterSpacing: style.letterSpacing,
      };
    })
  ).toEqual({
    fontSize: "16px",
    lineHeight: "22px",
    fontWeight: "600",
    letterSpacing: "normal",
  });

  await sheet.getByRole("button", { name: "Choose date" }).first().click();
  const calendar = page.locator('[data-finance-date-picker-content="true"]').last();
  await expect(calendar).toBeVisible();
  await capture(page, testInfo, "estimate-date-picker-desktop-1440");
  await expect(calendar).toHaveAttribute("data-finance-date-picker-appearance", "default");
  const calendarStyle = await calendar.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      background: style.backgroundColor,
      color: style.color,
      backdropFilter: style.backdropFilter,
    };
  });
  expect(calendarStyle).toEqual({
    background: "rgb(255, 255, 255)",
    color: "rgb(24, 26, 30)",
    backdropFilter: "none",
  });
  await expectNoHorizontalOverflow(page);
  expect(errors).toEqual([]);
});

test("Estimate dropdown preserves the 44px touch row on mobile", async ({ page }, testInfo) => {
  const errors = collectUnexpectedErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAsE2EOwner(page, `/estimates/${FIXED_ESTIMATE_ID}`);

  await page.getByRole("button", { name: "More estimate actions" }).click();
  const firstItem = page.getByRole("menu").getByRole("menuitem").first();
  await expect(firstItem).toBeVisible();
  await capture(page, testInfo, "estimate-dropdown-mobile-390");
  expect(
    await firstItem.evaluate((node) => ({
      height: node.getBoundingClientRect().height,
      radius: getComputedStyle(node).borderRadius,
    }))
  ).toEqual({ height: 44, radius: "6px" });
  await expectNoHorizontalOverflow(page);
  expect(errors).toEqual([]);
});

test("Estimate compatibility focus, native date, and reduced-motion state feedback stay V2", async ({
  page,
}, testInfo) => {
  const errors = collectUnexpectedErrors(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAsE2EOwner(page, "/estimates");

  const compatibility = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return {
      primary: style.getPropertyValue("--primary").trim(),
      ring: style.getPropertyValue("--ring").trim(),
    };
  });
  expect(compatibility).toEqual({
    primary: "221.2121212121 83.1932773109% 53.3333333333%",
    ring: "221.2121212121 83.1932773109% 53.3333333333%",
  });

  const statusFilter = page.getByRole("button", { name: /^All\s/ }).first();
  await expect(statusFilter).toBeVisible();
  expect(await statusFilter.evaluate((node) => getComputedStyle(node).transitionDuration)).not.toBe(
    "0.001ms"
  );

  await loginAsE2EOwner(page, `/estimates/${FIXED_ESTIMATE_ID}`);
  const header = page.getByTestId("estimate-detail-header");
  await header.getByRole("button", { name: "Edit", exact: true }).click();
  const pricingNavigation = page.getByRole("navigation", {
    name: "Pricing inspector sections",
  });
  await pricingNavigation.getByRole("button", { name: "Payment" }).click();
  const paymentSheet = page.getByTestId("estimate-payment-schedule-sheet");
  await paymentSheet.getByRole("button", { name: "Schedule Payment" }).click();
  const dateInput = page.locator('input[type="date"]').last();
  await expect(dateInput).toBeVisible();
  await expect(dateInput).toHaveCSS("color-scheme", "light");
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  await dateInput.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(dateInput).toBeFocused();
  const forcedColorsFocus = await dateInput.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      focusVisible: node.matches(":focus-visible"),
      forcedColors: window.matchMedia("(forced-colors: active)").matches,
      sheetClass: node.closest('[role="dialog"]')?.className ?? null,
    };
  });
  expect(forcedColorsFocus.sheetClass).toContain("estimate-builder");
  expect(forcedColorsFocus).toMatchObject({
    outlineStyle: "solid",
    outlineWidth: "2px",
    focusVisible: true,
    forcedColors: true,
  });
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "none" });
  await capture(page, testInfo, "estimate-v2-native-date-reduced-motion-desktop-1440");

  await expectNoHorizontalOverflow(page);
  expect(errors).toEqual([]);
});

test("single-line Foundation fields render 36px on desktop and 44px at portrait and mobile sizes", async ({
  page,
}, testInfo) => {
  const errors = collectUnexpectedErrors(page);

  for (const viewport of [
    { name: "desktop-1440", width: 1440, height: 900, expectedHeight: 36 },
    { name: "portrait-820", width: 820, height: 1180, expectedHeight: 44 },
    { name: "mobile-390", width: 390, height: 844, expectedHeight: 44 },
  ] as const) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await loginAsE2EOwner(page, `/estimates/${FIXED_ESTIMATE_ID}`);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByRole("button", { name: "Edit details", exact: true }).click();

    const sheet = page.getByRole("dialog", {
      name: "Customer / project / pricing details",
    });
    const input = sheet.getByLabel("Project / reference");
    const select = sheet.getByLabel("Existing project");
    await expect(sheet).toBeVisible();
    await expect(input).toBeVisible();
    await expect(select).toBeVisible();

    expect(await input.evaluate((node) => node.getBoundingClientRect().height)).toBe(
      viewport.expectedHeight
    );
    expect(await select.evaluate((node) => node.getBoundingClientRect().height)).toBe(
      viewport.expectedHeight
    );

    await capture(page, testInfo, `estimate-fields-${viewport.name}`);
    await expectNoHorizontalOverflow(page);
    await page.keyboard.press("Escape");
  }

  expect(errors).toEqual([]);
});
