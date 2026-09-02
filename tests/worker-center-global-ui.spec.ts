import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { addE2EOwnerSession } from "./e2e-auth-owner";

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");

async function firstWorkerId(page: Page): Promise<string | null> {
  const response = await page.request.get(`${BASE}/api/labor/workers`);
  expect(response.ok(), "Worker Center fixture request succeeds").toBeTruthy();
  const body = (await response.json().catch(() => null)) as Array<{ id?: string }> | null;
  return body?.find((worker) => typeof worker.id === "string" && worker.id)?.id ?? null;
}

async function expectNoHorizontalOverflow(page: Page, viewport: number) {
  expect(
    await page.locator("html").evaluate((node) => node.scrollWidth <= node.clientWidth),
    `${viewport}px Worker Center root horizontal overflow`
  ).toBe(true);
}

test.describe("Worker Center global UI", () => {
  test("keeps the certified dense-to-stacked worker record contract across viewports", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await addE2EOwnerSession(page.context(), BASE);
    await page.goto(`${BASE}/workers`, { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: "Worker Center", exact: true }).first()
    ).toBeVisible({
      timeout: 30_000,
    });

    const workerId = await firstWorkerId(page);
    test.skip(!workerId, "Worker Center UI contract needs the authorized local worker fixture.");

    for (const viewport of [
      { width: 1440, height: 900, mobile: false },
      { width: 1280, height: 900, mobile: false },
      { width: 1180, height: 820, mobile: false },
      { width: 820, height: 1180, mobile: false },
      { width: 390, height: 844, mobile: true },
    ]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const search = page.getByRole("textbox", { name: "Search workers" });
      await expect(search).toBeVisible();
      await expectNoHorizontalOverflow(page, viewport.width);

      if (viewport.mobile) {
        const cards = page.getByTestId("worker-center-mobile-cards");
        await expect(cards).toBeVisible();
        await expect(
          cards.getByRole("button", { name: new RegExp(`Actions for`, "i") }).first()
        ).toBeVisible();
        expect(
          (await search.boundingBox())?.height,
          `${viewport.width}px search target`
        ).toBeGreaterThanOrEqual(44);
      } else {
        const row = page.getByTestId("worker-center-row").first();
        await expect(row).toBeVisible();
        await expect(row).toHaveAttribute("role", "link");
        if (viewport.width === 820) {
          expect(
            (await search.boundingBox())?.height,
            "820px search target"
          ).toBeGreaterThanOrEqual(44);
        }
      }
    }

    await page.setViewportSize({ width: 390, height: 844 });
    const firstMobileCard = page
      .getByTestId("worker-center-mobile-cards")
      .locator("[role=button]")
      .first();
    await expect(firstMobileCard).toBeVisible();
    const timeAction = firstMobileCard.getByRole("link", { name: /^Time$/i });
    await expect(timeAction).toBeVisible();
    expect(
      (await timeAction.boundingBox())?.height,
      "390px time-entry action target"
    ).toBeGreaterThanOrEqual(44);

    const contrast = await new AxeBuilder({ page })
      .include("main")
      .withRules(["color-contrast"])
      .analyze();
    expect(contrast.violations).toEqual([]);

    await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
    expect(
      await page.evaluate(() => ({
        forcedColors: matchMedia("(forced-colors: active)").matches,
        reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
      }))
    ).toEqual({ forcedColors: true, reducedMotion: true });
    const forcedColorSearch = page.getByRole("textbox", { name: "Search workers" });
    await forcedColorSearch.focus();
    const forcedColorFocus = await forcedColorSearch.evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        animationName: styles.animationName,
        focusVisible: element.matches(":focus-visible"),
        outlineStyle: styles.outlineStyle,
        outlineWidth: Number.parseFloat(styles.outlineWidth),
        transitionProperty: styles.transitionProperty,
      };
    });
    expect(forcedColorFocus.focusVisible).toBe(true);
    expect(forcedColorFocus.outlineStyle).not.toBe("none");
    expect(forcedColorFocus.outlineWidth).toBeGreaterThan(0);
    expect(forcedColorFocus.animationName).toBe("none");
    expect(forcedColorFocus.transitionProperty).not.toContain("all");
    await expectNoHorizontalOverflow(page, 390);

    await page.emulateMedia({ forcedColors: "none", reducedMotion: "no-preference" });

    await page.goto(`${BASE}/workers/${encodeURIComponent(workerId!)}?tab=rates`, {
      waitUntil: "domcontentloaded",
    });
    const mobileRateHistory = page.getByTestId("worker-rate-history-mobile");
    if (await mobileRateHistory.count()) {
      await expect(mobileRateHistory).toContainText("Daily rate");
      await expect(mobileRateHistory).toContainText("Effective");
      await expect(mobileRateHistory).toContainText("Note");
      await expectNoHorizontalOverflow(page, 390);
    }

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
