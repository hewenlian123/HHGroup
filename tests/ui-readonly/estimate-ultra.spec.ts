import { ESTIMATE_FINANCIAL_FIXTURE_LEDGER } from "../estimate-financial-fixture";
import { build } from "esbuild";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./fixture";

const route = "/estimates/44444444-4444-4444-4444-444444444449";
test.use({ deviceScaleFactor: 2 });
const runtimeErrors = new Map<string, string[]>();
test.beforeEach(async ({ page }, info) => {
  const errors: string[] = [];
  runtimeErrors.set(info.testId, errors);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(route, { waitUntil: "networkidle" });
});

test.afterEach(async ({}, info) => {
  expect(runtimeErrors.get(info.testId) ?? []).toEqual([]);
  runtimeErrors.delete(info.testId);
});

test("empty scope search dismisses with Escape", async ({ page }) => {
  const search = page.getByRole("combobox", { name: "Search scope", exact: true });
  await search.fill("no-such-scope");
  await expect(page.getByRole("listbox", { name: "Scope search results" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox", { name: "Scope search results" })).toHaveCount(0);
  await expect(search).toBeFocused();
});

test("customer notes are directly visible without audience tabs", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Customer Notes", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Customer Notes", exact: true })).toHaveCount(0);
  await expect(page.getByText("Client-facing scope notes and clarifications", { exact: true })).toBeVisible();
});

for (const width of [1440, 1140, 1024, 768, 640, 390]) {
  test(`Estimate DPR2 workflow at ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1024 });
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator("[data-app-sidebar]:visible")).toHaveCount(width >= 1200 ? 1 : 0);
    expect(await page.evaluate(() => devicePixelRatio)).toBe(2);
    for (const selector of ["html", "[data-app-scroll-root]", ".eb-v3-worksheet-flow"]) {
      expect(
        await page.locator(selector).evaluate((e) => e.scrollWidth - e.clientWidth)
      ).toBeLessThanOrEqual(1);
    }
    await page.screenshot({
      animations: "disabled",
      path: info.outputPath(`estimate-${width}-dpr2.png`),
    });
    const actions = page.getByRole("button", {
      name: width < 768 ? "More estimate actions" : "Estimate actions",
      exact: true,
    });
    await actions.focus();
    await page.keyboard.press("Enter");
    const pricing = page.getByRole("menuitem", { name: "Pricing", exact: true });
    await pricing.focus();
    await page.keyboard.press("Enter");
    const drawer = page.locator('[role="dialog"][data-estimate-surface="pricing"]');
    await expect(drawer).toBeVisible();
    await expect(page.locator("body")).toHaveAttribute("data-scroll-locked", "1");
    for (const key of ["Tab", "Shift+Tab", "Tab"]) {
      await page.keyboard.press(key);
      await expect(drawer.locator(":focus")).toHaveCount(1);
    }
    await expect(drawer).toHaveCSS("opacity", "1");
    await page.screenshot({
      animations: "disabled",
      path: info.outputPath(`pricing-${width}-dpr2.png`),
    });
    const drawerAxe = await new AxeBuilder({ page })
      .include('[data-estimate-surface="pricing"]')
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(drawerAxe.violations).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: width < 768 ? "Edit details" : "Estimate actions",
        exact: true,
      })
    ).toBeFocused();
    await expect(page.locator("body")).not.toHaveAttribute("data-scroll-locked");
    await expect(page.locator("body")).not.toHaveCSS("pointer-events", "none");
    await page.getByRole("button", { name: "Edit details", exact: true }).click();
    const information = page.locator('[role="dialog"][data-estimate-surface="information"]');
    await expect(information).toBeVisible();
    await information.getByRole("button", { name: "Close", exact: true }).click();
    await expect(information).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Edit details", exact: true })).toBeFocused();
    const notes = page.getByRole("tab", { name: "Terms", exact: true });
    await notes.click();
    await expect(page.getByRole("tabpanel", { name: "Terms", exact: true })).toBeVisible();
    await page.screenshot({
      animations: "disabled",
      path: info.outputPath(`notes-${width}-dpr2.png`),
    });
    const payment = page.locator("#estimate-payment-schedule");
    await payment.scrollIntoViewIfNeeded();
    await expect(payment.getByTestId("payment-schedule-remaining")).toHaveText("$0.00");
    await page.screenshot({
      animations: "disabled",
      path: info.outputPath(`payment-${width}-dpr2.png`),
    });
    const results = await new AxeBuilder({ page })
      .include(".estimate-builder-new")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}

test("reduced motion keeps drawer focus and visible feedback", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "More estimate actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Pricing", exact: true }).click();
  const drawer = page.locator('[role="dialog"][data-estimate-surface="pricing"]');
  await expect(drawer).toBeVisible();
  await expect(drawer).toHaveCSS("animation-name", "hh-modal-fade-in");
  const animations = await drawer.evaluate((e) =>
    e.getAnimations().flatMap((a) => (a.effect as KeyframeEffect).getKeyframes())
  );
  expect(animations.length).toBeGreaterThan(0);
  expect(animations.every((frame) => !frame.transform && !frame.translate && !frame.scale)).toBe(
    true
  );
  await drawer.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(drawer).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit details", exact: true })).toBeFocused();
  await page.emulateMedia({ forcedColors: "active" });
  const search = page.getByRole("combobox", { name: "Search scope", exact: true });
  await search.focus();
  expect(
    await search.evaluate((e) => parseFloat(getComputedStyle(e).outlineWidth))
  ).toBeGreaterThanOrEqual(2);
});

test("populated Estimate components preserve financial and document surfaces", async ({
  page,
}, info) => {
  const result = await build({
    entryPoints: ["tests/ui-readonly/estimate-ultra-fixture.tsx"],
    bundle: true,
    write: false,
    outfile: "estimate-ultra-fixture.js",
    format: "iife",
    jsx: "automatic",
    // Match the App Router runtime, including function-valued form actions.
    alias: { react: "next/dist/compiled/react", "react-dom": "next/dist/compiled/react-dom" },
    define: {
      __ESTIMATE_LEDGER__: JSON.stringify(ESTIMATE_FINANCIAL_FIXTURE_LEDGER),
      "process.env": JSON.stringify({ NODE_ENV: "production", __NEXT_ROUTER_BASEPATH: "" }),
    },
    tsconfig: "tsconfig.json",
  });
  for (const file of result.outputFiles) {
    if (file.path.endsWith(".css")) await page.addStyleTag({ content: file.text });
    else await page.addScriptTag({ content: file.text });
  }
  for (const width of [1440, 1140, 1024, 768, 640, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1024 });
    const host = page.locator("#estimate-ultra-fixture");
    await host.locator('[data-estimate-workspace-header="true"]').scrollIntoViewIfNeeded();
    await expect(host.getByText("EST-0063", { exact: false }).first()).toBeVisible();
    await expect(host.getByTestId("payment-schedule-remaining")).toHaveText("$0.00");
    await expect(host.locator(".eb-payment-stat-value").nth(0)).toHaveText("$961.26");
    await expect(host.locator(".eb-payment-stat-value").nth(1)).toHaveText("$961.26");
    await expect(host.locator(".eb-payment-stat-value").nth(2)).toHaveText("100.0%");
    expect(await host.evaluate((e) => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(1);
    if (width === 1440) {
      const inspector = host.locator('[data-estimate-inspector="pricing"]');
      expect((await inspector.boundingBox())!.width).toBe(360);
      const money = inspector.locator(".eb-pricing-summary-cell > strong");
      const edges = await money.evaluateAll((elements) =>
        elements.map((e) => e.getBoundingClientRect().right)
      );
      expect(Math.max(...edges) - Math.min(...edges)).toBeLessThanOrEqual(1);
      await expect(money.first()).toHaveCSS("font-variant-numeric", "lining-nums tabular-nums");
      for (const [index, value] of ["$1,020.01", "-$106.81", "$48.06", "$961.26"].entries()) {
        await expect(inspector.locator(".eb-pricing-summary-cell > strong").nth(index)).toHaveText(
          value
        );
      }
      await expect(host.locator(".eb-payment-milestone-amount").nth(0)).toContainText("$384.50");
      await expect(host.locator(".eb-payment-milestone-amount").nth(1)).toContainText("$576.76");
      const axe = await new AxeBuilder({ page })
        .include("#estimate-ultra-fixture")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(axe.violations).toEqual([]);
    }
    if (width === 390) {
      const addLine = host.locator(".eb-add-line").first();
      await expect(addLine).toBeVisible();
      await expect(addLine).toHaveCSS("box-shadow", "none");
      await expect(addLine).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    }
    await page.screenshot({
      animations: "disabled",
      path: info.outputPath(`populated-${width}-dpr2.png`),
    });
    await host.locator("[data-estimate-payment-schedule]").scrollIntoViewIfNeeded();
    await page.screenshot({
      animations: "disabled",
      path: info.outputPath(`populated-payment-${width}-dpr2.png`),
    });
    await host.getByRole("heading", { name: "Notes & Clarifications" }).scrollIntoViewIfNeeded();
    await page.screenshot({
      animations: "disabled",
      path: info.outputPath(`populated-notes-${width}-dpr2.png`),
    });
  }
  // Simulate pending UI only; the fixture rejects every persistence action.
  await page.evaluate(() => window.dispatchEvent(new Event("estimate-ultra-saving")));
  const busy = page.getByRole("button", { name: "Saving…", exact: true });
  await expect(busy).toBeDisabled();
  await expect(busy).toHaveAttribute("aria-busy", "true");
  await expect(busy.locator("svg")).toHaveCSS("animation-name", "spin");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(busy.locator("svg")).toHaveCSS("animation-name", "none");
  await expect(page.locator('[data-estimate-save-state="saving"]')).toHaveText("Saving…");
  await expect(page.getByRole("dialog")).toHaveCSS("opacity", "1");
  await page.screenshot({
    animations: "disabled",
    path: info.outputPath("saving-reduced-motion-390-dpr2.png"),
  });
});

test("Estimate payment drawer returns focus to Schedule Payment", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const trigger = page.getByRole("button", { name: "Schedule Payment", exact: true });
  await trigger.click();
  const drawer = page.locator('[role="dialog"][data-estimate-surface="payment"]');
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(drawer.locator(":focus")).toHaveCount(1);
  await drawer.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(drawer).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.locator("body")).not.toHaveAttribute("data-scroll-locked");
});

test("Estimate shared drawers retain their visible opener", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const name of ["Activity", "Revision History"]) {
    const trigger = page.getByRole("button", { name: "More estimate actions", exact: true });
    await trigger.click();
    await page.getByRole("menuitem", { name, exact: true }).click();
    const drawer = page.getByRole("dialog", { name, exact: true });
    await expect(drawer).toBeVisible();
    await drawer.getByRole("button", { name: "Close", exact: true }).click();
    await expect(drawer).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
  await page.goto("/estimates/new", { waitUntil: "networkidle" });
  const trigger = page.getByRole("button", { name: "Edit details", exact: true });
  await trigger.click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("New Estimate payment drawer restores its opener without saving", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/estimates/new", { waitUntil: "networkidle" });
  const trigger = page.getByRole("button", { name: "Schedule Payment", exact: true });
  await trigger.click();
  const drawer = page.getByRole("dialog", { name: "Schedule Payment", exact: true });
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.locator("body")).not.toHaveAttribute("data-scroll-locked");
});

test("Estimate inspector Payment and Details keep keyboard navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1024 });
  const inspector = page.locator('[data-estimate-inspector="pricing"]');
  await inspector.getByRole("button", { name: "Payment", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#estimate-payment-schedule")).toBeFocused();
  const details = inspector.getByRole("button", { name: "Details", exact: true });
  await details.focus();
  await page.keyboard.press("Enter");
  const drawer = page.getByRole("dialog", {
    name: "Customer, project, and estimate details",
    exact: true,
  });
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(details).toBeFocused();
});
