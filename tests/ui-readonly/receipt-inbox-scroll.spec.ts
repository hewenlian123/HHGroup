import type { Page } from "@playwright/test";

import { expect, test, receiptId } from "./receipt-inbox-fixture";
import AxeBuilder from "@axe-core/playwright";

test.use({ deviceScaleFactor: 2, storageState: { cookies: [], origins: [] } });

const viewports = [
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "desktop-1280", width: 1280, height: 800 },
  { name: "desktop-1140", width: 1140, height: 900 },
  { name: "ipad-landscape", width: 1024, height: 768 },
  { name: "ipad-portrait", width: 768, height: 1024 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "mobile-640", width: 640, height: 900 },
  { name: "mobile-320", width: 320, height: 844 },
];

type Metrics = {
  document: { scrollHeight: number; scrollWidth: number; clientWidth: number };
  app: { clientHeight: number; scrollHeight: number; scrollTop: number; overflowY: string };
  workspace: { height: number; overflowY: string };
  panel: { top: number; bottom: number; height: number };
  body: { clientHeight: number; scrollHeight: number; scrollTop: number; overflowY: string };
  footer: { top: number; bottom: number };
  queue: { top: number; height: number } | null;
  preview: { top: number; height: number } | null;
};

async function metrics(page: Page): Promise<Metrics> {
  return page.evaluate(() => {
    const root = document.querySelector("[data-expenses-list-page='inbox']");
    const workspace = root?.querySelector<HTMLElement>("[data-expense-operations-workspace]");
    const app = document.querySelector<HTMLElement>("[data-app-scroll-root]");
    const panel = root?.querySelector<HTMLElement>("[data-expense-detail-panel]");
    const body = panel?.querySelector<HTMLElement>("[data-expense-detail-body]");
    const footer = panel?.querySelector<HTMLElement>(".expense-detail-actions");
    const queue = root?.querySelector<HTMLElement>("[data-expenses-ledger]") ?? null;
    const preview = root?.querySelector<HTMLElement>("[data-expense-receipt-stage]") ?? null;

    if (!workspace || !app || !panel || !body || !footer) {
      throw new Error("Receipt Inbox review layout is not ready for scroll verification.");
    }

    const panelRect = panel.getBoundingClientRect();
    const toMetric = (element: HTMLElement | null) => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return { top: rect.top, height: rect.height };
    };
    return {
      document: {
        scrollHeight: document.documentElement.scrollHeight,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      },
      app: {
        clientHeight: app.clientHeight,
        scrollHeight: app.scrollHeight,
        scrollTop: app.scrollTop,
        overflowY: getComputedStyle(app).overflowY,
      },
      workspace: {
        height: workspace.getBoundingClientRect().height,
        overflowY: getComputedStyle(workspace).overflowY,
      },
      panel: { top: panelRect.top, bottom: panelRect.bottom, height: panelRect.height },
      body: {
        clientHeight: body.clientHeight,
        scrollHeight: body.scrollHeight,
        scrollTop: body.scrollTop,
        overflowY: getComputedStyle(body).overflowY,
      },
      footer: {
        top: footer.getBoundingClientRect().top,
        bottom: footer.getBoundingClientRect().bottom,
      },
      queue: toMetric(queue),
      preview: toMetric(preview),
    };
  });
}

async function openReceiptReview(page: Page, expectedAmount?: string) {
  await page.goto("/financial/inbox?date_kind=all", { waitUntil: "domcontentloaded" });

  const root = page.locator("[data-expenses-list-page='inbox']");
  await expect(root).toBeVisible();
  const receipt = root.locator("[data-expense-id]:visible").first();
  await expect(receipt).toBeVisible({ timeout: 60_000 });
  await expect(receipt).toHaveAttribute("data-expense-id", receiptId);
  await expect(receipt).toContainText("PW Receipt Evidence Supplier");
  if (expectedAmount) {
    const amount = receipt.getByText(expectedAmount, { exact: true });
    await expect(amount).toBeVisible();
    expect(
      await amount.evaluate((element) => element.scrollWidth - element.clientWidth)
    ).toBeLessThanOrEqual(1);
  }
  await receipt.click();

  const panel = root.locator("[data-expense-detail-panel]");
  await expect(panel).toHaveAttribute("data-expense-detail-mode", "review");
  await expect(panel.locator("[data-expense-detail-body]")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return panel;
}

test.describe("Receipt Inbox review scroll ownership (read-only)", () => {
  test.describe.configure({ timeout: 180_000 });

  for (const viewport of viewports) {
    test(`keeps More Details contained at ${viewport.name}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const panel = await openReceiptReview(page);
      expect(await page.evaluate(() => devicePixelRatio)).toBe(2);
      const body = panel.locator("[data-expense-detail-body]");
      const moreDetails = panel.locator("details.expense-more-details").first();

      await expect(moreDetails).toBeVisible();
      await expect(moreDetails).not.toHaveAttribute("open", "");
      const collapsed = await metrics(page);

      await moreDetails.locator("summary").focus();
      await expect(moreDetails.locator("summary")).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(moreDetails).toHaveAttribute("open", "");
      await page.keyboard.press("Enter");
      await expect(moreDetails).not.toHaveAttribute("open", "");

      await moreDetails.locator("summary").click();
      await expect(moreDetails).toHaveAttribute("open", "");
      const expanded = await metrics(page);

      expect(expanded.document.scrollWidth).toBeLessThanOrEqual(expanded.document.clientWidth + 1);
      const nativePageScroll = await page.evaluate(() => {
        window.scrollTo({ top: Number.MAX_SAFE_INTEGER });
        const scrollTop = window.scrollY;
        window.scrollTo({ top: 0 });
        return scrollTop;
      });
      expect(nativePageScroll).toBe(0);
      expect(expanded.document.scrollHeight).toBeLessThanOrEqual(
        collapsed.document.scrollHeight + 1
      );
      if (viewport.width >= 1024) {
        expect(expanded.app.scrollHeight).toBeLessThanOrEqual(expanded.app.clientHeight + 1);
        expect(expanded.app.scrollHeight).toBeLessThanOrEqual(collapsed.app.scrollHeight + 1);
        expect(expanded.workspace.height).toBeCloseTo(collapsed.workspace.height, 0);
        expect(expanded.workspace.overflowY).toBe("hidden");
      } else {
        expect(expanded.app.overflowY).toBe("hidden");
      }
      expect(expanded.panel.height).toBeCloseTo(collapsed.panel.height, 0);
      expect(expanded.body.overflowY).toMatch(/auto|scroll/);
      expect(expanded.body.scrollHeight).toBeGreaterThanOrEqual(expanded.body.clientHeight);
      expect(expanded.footer.top).toBeGreaterThanOrEqual(expanded.panel.top);
      expect(expanded.footer.bottom).toBeLessThanOrEqual(expanded.panel.bottom + 1);

      if (collapsed.queue && expanded.queue) {
        expect(
          expanded.queue.top,
          JSON.stringify({
            collapsed: { app: collapsed.app, body: collapsed.body },
            expanded: { app: expanded.app, body: expanded.body },
          })
        ).toBeCloseTo(collapsed.queue.top, 0);
        expect(expanded.queue.height).toBeCloseTo(collapsed.queue.height, 0);
      }
      if (collapsed.preview && expanded.preview) {
        expect(expanded.preview.top).toBeCloseTo(collapsed.preview.top, 0);
        expect(expanded.preview.height).toBeCloseTo(collapsed.preview.height, 0);
      }

      await body.evaluate((element) => {
        element.scrollTop = Math.max(1, element.scrollHeight - element.clientHeight);
      });
      await page.screenshot({
        animations: "disabled",
        path: testInfo.outputPath(`receipt-inbox-${viewport.name}-expanded-body-scroll.png`),
      });
      await expect
        .poll(() => body.evaluate((element) => element.scrollTop))
        .toBeGreaterThanOrEqual(0);

      // The trailing file input is aria-hidden/tabindex=-1; it is not a review field.
      const lastField = moreDetails.getByRole("combobox", { name: "Payment account", exact: true });
      await lastField.scrollIntoViewIfNeeded();
      await expect(lastField).toBeVisible();
      const scrolled = await metrics(page);
      await lastField.focus();
      await expect(lastField).toBeFocused();
      const focused = await metrics(page);
      const ancestorScroll = await lastField.evaluate((element) => {
        const result = [];
        for (let parent = element.parentElement; parent; parent = parent.parentElement) {
          if (parent.scrollTop)
            result.push({
              tag: parent.tagName,
              className: parent.className,
              scrollTop: parent.scrollTop,
              overflowY: getComputedStyle(parent).overflowY,
            });
        }
        return result;
      });
      await testInfo.attach("receipt-focus-scroll-metrics", {
        body: JSON.stringify({ expanded, scrolled, focused, ancestorScroll }, null, 2),
        contentType: "application/json",
      });
      expect.soft(focused.panel.top).toBeCloseTo(expanded.panel.top, 0);
      await page.screenshot({
        animations: "disabled",
        path: testInfo.outputPath(`receipt-inbox-${viewport.name}-focused-before-axe.png`),
      });
      const accessibility = await new AxeBuilder({ page })
        .include("[data-expense-detail-panel]")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      await testInfo.attach("receipt-accessibility", {
        body: JSON.stringify(accessibility, null, 2),
        contentType: "application/json",
      });
      await testInfo.attach("receipt-rendered-preview-colors", {
        body: JSON.stringify(
          await panel.locator("[data-expense-receipt-stage]").evaluateAll((stages) =>
            stages.map((stage) => ({
              background: getComputedStyle(stage).backgroundColor,
              text: Array.from(stage.querySelectorAll("p")).map((element) => ({
                text: element.textContent,
                foreground: getComputedStyle(element).color,
                fontSize: getComputedStyle(element).fontSize,
              })),
            }))
          ),
          null,
          2
        ),
        contentType: "application/json",
      });
      expect.soft(accessibility.violations).toEqual([]);
      await page.screenshot({
        animations: "disabled",
        path: testInfo.outputPath(`receipt-inbox-${viewport.name}-expanded.png`),
      });

      await moreDetails.locator("summary").click();
      await expect(moreDetails).not.toHaveAttribute("open", "");
      const restored = await metrics(page);
      await testInfo.attach("receipt-scroll-metrics", {
        body: JSON.stringify({ viewport, collapsed, expanded, restored }, null, 2),
        contentType: "application/json",
      });
      expect(restored.document.scrollWidth).toBeLessThanOrEqual(restored.document.clientWidth + 1);
      expect(restored.document.scrollHeight).toBeLessThanOrEqual(
        collapsed.document.scrollHeight + 1
      );
      if (viewport.width >= 1024) {
        expect(restored.app.scrollHeight).toBeLessThanOrEqual(restored.app.clientHeight + 1);
        expect(restored.app.scrollHeight).toBeLessThanOrEqual(collapsed.app.scrollHeight + 1);
        expect(restored.workspace.height).toBeCloseTo(collapsed.workspace.height, 0);
        expect(restored.workspace.overflowY).toBe("hidden");
      } else {
        expect(restored.app.overflowY).toBe("hidden");
      }
      expect(restored.panel.height).toBeCloseTo(collapsed.panel.height, 0);
      expect(restored.footer.bottom).toBeLessThanOrEqual(restored.panel.bottom + 1);
      await page.screenshot({
        animations: "disabled",
        path: testInfo.outputPath(`receipt-inbox-${viewport.name}-collapsed.png`),
      });
    });
  }
});

test.describe("Receipt source amount remains exact", () => {
  test.use({ receiptAmount: 999999999.99 });
  for (const width of [1440, 390, 320]) {
    test(`renders long canonical line amount at ${width}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      const panel = await openReceiptReview(page, "-$999,999,999.99");
      await expect(panel.getByRole("spinbutton", { name: "Amount", exact: true })).toHaveValue(
        "999999999.99"
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        )
      ).toBeLessThanOrEqual(1);
      await info.attach("receipt-source-amount", {
        body: JSON.stringify({
          expenseLineAmount: 999999999.99,
          expectedFormatted: "-$999,999,999.99",
          expectedInput: "999999999.99",
          width,
        }),
        contentType: "application/json",
      });
      await page.screenshot({
        animations: "disabled",
        path: info.outputPath(`receipt-long-amount-${width}.png`),
      });
    });
  }
});

for (const width of [1440, 390]) {
  test(`native keyboard keeps review panel contained at ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const panel = await openReceiptReview(page);
    const details = panel.locator("details.expense-more-details").first();
    await details.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(details).toHaveAttribute("open", "");
    const before = await metrics(page);
    const lastField = details.getByRole("combobox", { name: "Payment account", exact: true });
    for (
      let index = 0;
      index < 30 && !(await lastField.evaluate((element) => element === document.activeElement));
      index++
    ) {
      await page.keyboard.press("Tab");
    }
    await expect(lastField).toBeFocused();
    const after = await metrics(page);
    await info.attach("native-keyboard-scroll", {
      body: JSON.stringify({ width, before, after }, null, 2),
      contentType: "application/json",
    });
    await page.screenshot({
      animations: "disabled",
      path: info.outputPath(`receipt-native-keyboard-${width}.png`),
    });
    expect(after.panel.top).toBeCloseTo(before.panel.top, 0);
  });
}
