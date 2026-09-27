import { expect, test, type Locator } from "@playwright/test";

import { loginAsE2EOwner } from "./e2e-auth-owner";

type Rgb = { r: number; g: number; b: number; a: number };

function parseRgb(value: string): Rgb {
  const channels = value.match(/[\d.]+/g)?.map(Number) ?? [];
  if (channels.length < 3) throw new Error(`Unsupported computed color: ${value}`);
  return { r: channels[0], g: channels[1], b: channels[2], a: channels[3] ?? 1 };
}

function luminance({ r, g, b }: Rgb): number {
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function ratio(foreground: Rgb, background: Rgb): number {
  const composite =
    foreground.a < 1
      ? {
          r: foreground.r * foreground.a + background.r * (1 - foreground.a),
          g: foreground.g * foreground.a + background.g * (1 - foreground.a),
          b: foreground.b * foreground.a + background.b * (1 - foreground.a),
          a: 1,
        }
      : foreground;
  const lighter = Math.max(luminance(composite), luminance(background));
  const darker = Math.min(luminance(composite), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

async function renderedContrast(locator: Locator): Promise<{
  foreground: string;
  background: string;
  ratio: number;
}> {
  const pair = await locator.evaluate((element) => {
    const foreground = getComputedStyle(element).color;
    let current: Element | null = element;
    let background = "rgb(255, 255, 255)";
    while (current) {
      const candidate = getComputedStyle(current).backgroundColor;
      if (candidate !== "rgba(0, 0, 0, 0)" && candidate !== "transparent") {
        background = candidate;
        break;
      }
      current = current.parentElement;
    }
    return { foreground, background };
  });
  return {
    ...pair,
    ratio: ratio(parseRgb(pair.foreground), parseRgb(pair.background)),
  };
}

async function expectTextContrast(locator: Locator, label: string) {
  await expect(locator, `${label} is rendered`).toBeVisible();
  const evidence = await renderedContrast(locator);
  await test.info().attach(`${label}-contrast.json`, {
    body: JSON.stringify(evidence, null, 2),
    contentType: "application/json",
  });
  expect(evidence.ratio, `${label}: ${JSON.stringify(evidence)}`).toBeGreaterThanOrEqual(4.5);
}

test("Revenue & AR V2 key light-theme text pairs meet rendered contrast", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAsE2EOwner(page, "/financial/payments");
  await expectTextContrast(
    page.getByText("Summary", { exact: true }).first(),
    "payments-summary-label"
  );
  await expectTextContrast(
    page.getByText("Search", { exact: true }).first(),
    "payments-search-label"
  );
  await expectTextContrast(
    page.getByRole("button", { name: "Receive Payment" }).first(),
    "payments-primary-action"
  );

  await page.goto("/financial/deposits", { waitUntil: "networkidle" });
  await expectTextContrast(
    page.getByText("Summary", { exact: true }).first(),
    "deposits-summary-label"
  );
  await expectTextContrast(
    page.getByText("Search", { exact: true }).first(),
    "deposits-search-label"
  );
});

test("Revenue & AR V2 preserves focus, overflow, and reduced motion in forced colors", async ({
  page,
}) => {
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAsE2EOwner(page, "/financial/payments");

  const primary = page.getByRole("button", { name: "Receive Payment" }).first();
  await expect(primary).toBeVisible();
  await primary.focus();
  await expect(primary).toBeFocused();

  const evidence = await page.evaluate(() => {
    const focused = document.activeElement as HTMLElement | null;
    const styles = focused ? getComputedStyle(focused) : null;
    const surface = document.querySelector<HTMLElement>("[data-revenue-ar-v2]");
    const durations = Array.from(
      surface?.querySelectorAll<HTMLElement>("button, a, [role='button']") ?? []
    )
      .filter((element) => element.offsetParent !== null)
      .flatMap((element) => getComputedStyle(element).transitionDuration.split(","))
      .map((duration) => {
        const value = Number.parseFloat(duration);
        return duration.trim().endsWith("ms") ? value : value * 1000;
      });
    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      focusedOutlineStyle: styles?.outlineStyle ?? "none",
      focusedOutlineWidth: styles?.outlineWidth ?? "0px",
      focusedBoxShadow: styles?.boxShadow ?? "none",
      forcedColorsActive: window.matchMedia("(forced-colors: active)").matches,
      reducedMotionActive: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      maxTransitionMs: durations.length ? Math.max(...durations) : 0,
    };
  });

  await test.info().attach("forced-colors-reduced-motion.json", {
    body: JSON.stringify(evidence, null, 2),
    contentType: "application/json",
  });
  await page.screenshot({
    path: "test-results/revenue-ar-v2/forced-colors-reduced-motion-390x844.png",
    fullPage: true,
  });

  expect(evidence.documentWidth).toBeLessThanOrEqual(evidence.viewportWidth + 1);
  expect(evidence.forcedColorsActive).toBe(true);
  expect(evidence.reducedMotionActive).toBe(true);
  expect(evidence.maxTransitionMs).toBeLessThanOrEqual(1);
  expect(
    evidence.focusedOutlineStyle !== "none" ||
      evidence.focusedOutlineWidth !== "0px" ||
      evidence.focusedBoxShadow !== "none"
  ).toBe(true);
});
