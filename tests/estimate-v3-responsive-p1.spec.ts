import { mkdir, writeFile } from "node:fs/promises";

import { expect, test, type Locator, type Page } from "./estimate-playwright-test";
import { loginAsE2EOwner } from "./e2e-auth-owner";
import {
  cleanupDenseEstimateFixture,
  DENSE_ESTIMATE_DISCOUNT,
  DENSE_ESTIMATE_ID,
  DENSE_ESTIMATE_ITEM_COUNT,
  DENSE_ESTIMATE_NUMBER,
  DENSE_ESTIMATE_PAYMENT_COUNT,
  DENSE_ESTIMATE_TAX,
  DENSE_ESTIMATE_TOTAL,
  captureUnexpectedBrowserErrors,
  seedDenseEstimateFixture,
} from "./estimate-dense-fixture";

const EVIDENCE_DIR = "/private/tmp/hh-estimate-v3-p1-repair";

type Box = {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
};

async function box(locator: Locator): Promise<Box> {
  const value = await locator.boundingBox();
  expect(value, `Expected a rendered box for ${locator}`).not.toBeNull();
  return {
    top: value!.y,
    right: value!.x + value!.width,
    bottom: value!.y + value!.height,
    left: value!.x,
    width: value!.width,
    height: value!.height,
  };
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  await expect
    .poll(() =>
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

async function firstDesktopLine(page: Page): Promise<Locator> {
  const line = page.locator("[data-estimate-line-item-id]:visible").first();
  await expect(line).toBeVisible();
  return line;
}

async function assertTabletLineComposition(page: Page): Promise<Record<string, Box>> {
  const line = await firstDesktopLine(page);
  const description = line.locator(".eb-line-item-description-block");
  const quantity = line.getByLabel("Line item quantity", { exact: true });
  const unit = line.getByLabel("Line item unit", { exact: true });
  const unitPrice = line.getByLabel("Line item unit price", { exact: true });
  const total = line.locator(".eb-line-total-block");
  const more = line.getByRole("button", { name: "More actions" });

  for (const label of [
    ".eb-line-qty-label",
    ".eb-line-measure-label",
    ".eb-line-unit-label",
    ".eb-line-total-label",
  ]) {
    await expect(line.locator(label)).toBeVisible();
  }

  const descriptionBox = await box(description);
  const [quantityBox, unitBox, unitPriceBox, totalBox] = await Promise.all(
    [quantity, unit, unitPrice, total].map(box)
  );
  const financialBoxes = [quantityBox, unitBox, unitPriceBox, totalBox];
  const firstFinancialTop = Math.min(...financialBoxes.map((value) => value.top));
  expect(
    descriptionBox.bottom,
    "Description must finish before the tablet financial row starts"
  ).toBeLessThanOrEqual(firstFinancialTop + 1);

  const lineBox = await box(line);
  const moreBox = await box(more);
  for (const [name, value] of [
    ["quantity", quantityBox],
    ["unit", unitBox],
    ["unit price", unitPriceBox],
    ["line total", totalBox],
    ["more actions", moreBox],
  ] as const) {
    expect(value.left, `${name} must remain inside the line item`).toBeGreaterThanOrEqual(
      lineBox.left - 1
    );
    expect(value.right, `${name} must remain inside the line item`).toBeLessThanOrEqual(
      lineBox.right + 1
    );
  }

  for (const control of [quantity, unit, unitPrice, more]) {
    expect((await box(control)).height).toBeGreaterThanOrEqual(44);
  }

  return {
    line: lineBox,
    description: descriptionBox,
    quantity: quantityBox,
    unit: unitBox,
    unitPrice: unitPriceBox,
    total: totalBox,
    more: moreBox,
  };
}

async function captureContrastEvidence(page: Page): Promise<unknown[]> {
  return page.evaluate(() => {
    const probes = [
      ["Item label", ".eb-line-title-label"],
      ["Description", ".eb-description-summary-text"],
      ["Quantity label", ".eb-line-qty-label"],
      ["Quantity input", "input[aria-label='Line item quantity']"],
      ["Line total", ".eb-line-total"],
    ] as const;

    const parseColor = (value: string): [number, number, number, number] => {
      const values = value.match(/[\d.]+/g)?.map(Number) ?? [];
      return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0, values[3] ?? 1];
    };
    const luminance = ([red, green, blue]: readonly number[]): number => {
      const linear = [red, green, blue].map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.04045
          ? normalized / 12.92
          : Math.pow((normalized + 0.055) / 1.055, 2.4);
      });
      return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    };

    return probes.map(([name, selector]) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) throw new Error(`Missing contrast probe: ${selector}`);
      const foregroundValue = getComputedStyle(element).color;
      let backgroundElement: HTMLElement | null = element;
      let backgroundValue = "rgb(255, 255, 255)";
      while (backgroundElement) {
        const candidate = getComputedStyle(backgroundElement).backgroundColor;
        if (parseColor(candidate)[3] > 0) {
          backgroundValue = candidate;
          break;
        }
        backgroundElement = backgroundElement.parentElement;
      }
      const foreground = parseColor(foregroundValue);
      const background = parseColor(backgroundValue);
      const lighter = Math.max(luminance(foreground), luminance(background));
      const darker = Math.min(luminance(foreground), luminance(background));
      return {
        name,
        selector,
        foreground: foregroundValue,
        background: backgroundValue,
        ratio: Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2)),
      };
    });
  });
}

test.beforeAll(async () => {
  await mkdir(EVIDENCE_DIR, { recursive: true });
  await seedDenseEstimateFixture();
});

test.afterAll(async () => {
  await cleanupDenseEstimateFixture();
});

test("Estimate V3 dense worksheet preserves construction scope and financial semantics at every viewport", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const runtimeErrors = captureUnexpectedBrowserErrors(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAsE2EOwner(page, `/estimates/${DENSE_ESTIMATE_ID}`);

  await expect(page.locator("[data-estimate-section-id]")).toHaveCount(10);
  await expect(page.locator("[data-estimate-line-item-id]:visible")).toHaveCount(
    DENSE_ESTIMATE_ITEM_COUNT
  );
  await expect(page.locator("body")).toContainText("$3,253,937.00");
  await expect(page.locator("body")).toContainText("$1,250.00");
  await expect(page.locator("#estimate-terms-notes")).toContainText("Site access assumptions");
  await expect(page.locator("#estimate-payment-schedule")).toContainText(
    "Certified payment milestone 5"
  );

  const scopeTools = page.getByRole("toolbar", { name: "Scope tools" });
  const scopeSearch = scopeTools.getByRole("combobox", { name: "Search scope" });
  await scopeSearch.fill("scope line 62");
  const finalScopeResult = page.getByRole("option", {
    name: /Certified construction scope line 62/,
  });
  await expect(finalScopeResult).toBeVisible();
  await finalScopeResult.click();
  await expect(scopeSearch).toHaveValue("");

  await scopeTools.getByRole("button", { name: "Collapse all" }).click();
  await expect(page.getByRole("button", { name: "Expand section" })).toHaveCount(10);
  await scopeTools.getByRole("button", { name: "Expand all" }).click();
  await expect(page.getByRole("button", { name: "Collapse section" })).toHaveCount(10);

  const scanEvidence: Record<string, unknown> = {};
  for (const viewport of [
    { name: "desktop-1440", width: 1440, height: 1000 },
    { name: "desktop-1280", width: 1280, height: 900 },
    { name: "ipad-landscape-1180", width: 1180, height: 820 },
    { name: "ipad-portrait-820", width: 820, height: 1180 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const readLine = await firstDesktopLine(page);
    const readTitle = readLine.locator(".eb-line-item-title-control p");
    const readDescription = readLine.locator(".eb-scope-description-readonly");
    await expect(readTitle).toHaveCSS("-webkit-line-clamp", "2");
    await expect(readDescription).toHaveCSS("-webkit-line-clamp", "2");
    await expectNoHorizontalOverflow(page);
    scanEvidence[viewport.name] = await readLine.evaluate((line) => ({
      height: line.getBoundingClientRect().height,
      titleClamp: getComputedStyle(line.querySelector(".eb-line-item-title-control p")!)
        .webkitLineClamp,
      descriptionClamp: getComputedStyle(line.querySelector(".eb-scope-description-readonly")!)
        .webkitLineClamp,
    }));
    await page.screenshot({
      path: `${EVIDENCE_DIR}/${viewport.name}-read.png`,
      fullPage: false,
    });
  }

  await page.setViewportSize({ width: 1440, height: 1000 });

  const header = page.getByTestId("estimate-detail-header");
  await header.getByRole("button", { name: "Edit", exact: true }).click();

  const viewportEvidence: Record<string, unknown> = {};
  for (const viewport of [
    { name: "desktop-1440", width: 1440, height: 1000 },
    { name: "desktop-1280", width: 1280, height: 900 },
    { name: "ipad-landscape-1180", width: 1180, height: 820 },
    { name: "ipad-portrait-820", width: 820, height: 1180 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.evaluate(() => window.scrollTo(0, 0));
    await expectNoHorizontalOverflow(page);

    if (viewport.width < 1200) {
      viewportEvidence[viewport.name] = {
        geometry: await assertTabletLineComposition(page),
      };
    } else {
      await expect(page.getByTestId("estimate-line-item-grid-header")).toBeVisible();
    }

    const line = await firstDesktopLine(page);
    const dragHandle = line.locator(".eb-line-item-reorder-handle");
    const section = page.locator("[data-estimate-section-id]:visible").first();
    const collapse = section.locator(".eb-scope-section-collapse-btn");
    for (const target of [dragHandle, section, collapse]) {
      await expect(target).toHaveCSS("transition-duration", "0s");
    }
    if (viewport.width < 1200) {
      const collapseBox = await box(collapse);
      expect(collapseBox.width).toBeGreaterThanOrEqual(44);
      expect(collapseBox.height).toBeGreaterThanOrEqual(44);
      viewportEvidence[viewport.name] = {
        ...(viewportEvidence[viewport.name] as object),
        collapseControl: collapseBox,
      };
    }

    await page.screenshot({ path: `${EVIDENCE_DIR}/${viewport.name}-edit.png`, fullPage: false });
    viewportEvidence[viewport.name] = {
      ...(viewportEvidence[viewport.name] as object | undefined),
      ...(await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        appScrollWidth:
          document.querySelector<HTMLElement>("[data-app-scroll-root]")?.scrollWidth ?? null,
      }))),
    };
  }

  await page.setViewportSize({ width: 820, height: 1180 });
  const contrastEvidence = await captureContrastEvidence(page);
  for (const item of contrastEvidence as Array<{ ratio: number }>) {
    expect(item.ratio).toBeGreaterThanOrEqual(4.5);
  }

  await page.setViewportSize({ width: 1180, height: 820 });
  const payment = page.locator("#estimate-payment-schedule");
  await payment.scrollIntoViewIfNeeded();
  const paymentActions: Record<string, Box> = {};
  for (const action of [
    payment.getByRole("button", { name: /^Edit Certified payment milestone 1$/ }),
    payment.getByRole("button", { name: /^Delete Certified payment milestone 1$/ }),
  ]) {
    const actionBox = await box(action);
    expect(actionBox.width).toBeGreaterThanOrEqual(44);
    expect(actionBox.height).toBeGreaterThanOrEqual(44);
    paymentActions[(await action.getAttribute("aria-label")) ?? "unknown"] = actionBox;
  }
  viewportEvidence["ipad-landscape-1180"] = {
    ...(viewportEvidence["ipad-landscape-1180"] as object),
    paymentActions,
  };

  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(
    true
  );
  await expect
    .poll(() =>
      page.evaluate(
        () => document.getAnimations().filter((item) => item.playState === "running").length
      )
    )
    .toBe(0);

  await writeFile(
    `${EVIDENCE_DIR}/responsive-evidence.json`,
    JSON.stringify({ scanEvidence, viewportEvidence, contrastEvidence }, null, 2),
    "utf8"
  );
  expect(runtimeErrors).toEqual([]);
});

test("Estimate V3 mobile 390 completes open edit save and preview in one context", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const runtimeErrors = captureUnexpectedBrowserErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAsE2EOwner(page, `/estimates/${DENSE_ESTIMATE_ID}`);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: `${EVIDENCE_DIR}/mobile-390-01-open.png`, fullPage: false });

  const initialTotal = "$3,253,937.00";
  await expect(page.locator("body")).toContainText(initialTotal);
  const header = page.getByTestId("estimate-detail-header");
  await header.getByRole("button", { name: "Edit", exact: true }).click();

  const firstItem = page.getByRole("button", { name: /^Edit line item 1:/ }).first();
  await firstItem.scrollIntoViewIfNeeded();
  await firstItem.click();
  const title = page.getByLabel("Line item 1 title", { exact: true });
  const originalTitle = await title.inputValue();
  await title.fill(`${originalTitle} mobile verified`);
  await title.blur();
  await page.screenshot({ path: `${EVIDENCE_DIR}/mobile-390-02-edit.png`, fullPage: false });

  const save = page.getByRole("button", { name: "Save", exact: true });
  const refreshResponse = page.waitForResponse(
    (response) =>
      response.url().includes(`/estimates/${DENSE_ESTIMATE_ID}`) &&
      response.url().includes("_rsc=") &&
      response.ok(),
    { timeout: 30_000 }
  );
  await save.click();
  await expect(save).toBeHidden({ timeout: 30_000 });
  await refreshResponse;
  await expect(page.locator("body")).toContainText("mobile verified", { timeout: 30_000 });
  await expect(page.locator("body")).toContainText(initialTotal);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: `${EVIDENCE_DIR}/mobile-390-03-saved.png`, fullPage: false });

  const previewLink = page
    .getByTestId("estimate-detail-header")
    .getByRole("link", { name: "Preview", exact: true });
  await expect(previewLink).toBeVisible();
  await previewLink.click();
  await expect(page).toHaveURL(/\/preview(?:\?|$)/);
  await expect(page.locator("main")).toContainText("mobile verified");
  await expect(page.locator("main")).toContainText(initialTotal);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: `${EVIDENCE_DIR}/mobile-390-04-preview.png`, fullPage: false });

  const pdfResponse = await page.request.get(`/api/estimates/${DENSE_ESTIMATE_ID}/pdf`);
  expect(pdfResponse.status()).toBe(200);
  const contentDisposition = pdfResponse.headers()["content-disposition"] ?? "";
  expect(contentDisposition).toContain("EST-DENSE-0079");
  expect(contentDisposition).toContain("Rev_0.pdf");
  const pdf = await pdfResponse.body();
  expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  await writeFile(`${EVIDENCE_DIR}/${DENSE_ESTIMATE_NUMBER}.pdf`, pdf);

  await writeFile(
    `${EVIDENCE_DIR}/mobile-flow.json`,
    JSON.stringify(
      {
        viewport: { width: 390, height: 844 },
        steps: ["open", "edit line", "save and settle persisted state", "preview"],
        originalTitle,
        savedTitle: `${originalTitle} mobile verified`,
        total: DENSE_ESTIMATE_TOTAL,
        tax: DENSE_ESTIMATE_TAX,
        discount: DENSE_ESTIMATE_DISCOUNT,
        paymentCount: DENSE_ESTIMATE_PAYMENT_COUNT,
        horizontalOverflow: 0,
      },
      null,
      2
    ),
    "utf8"
  );
  expect(runtimeErrors).toEqual([]);
});
