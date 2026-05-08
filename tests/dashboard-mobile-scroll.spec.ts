import { expect, test, type Locator, type Page } from "@playwright/test";

async function appScrollRoot(page: Page): Promise<Locator> {
  const main = page.locator("[data-app-scroll-root]").first();
  await expect(main).toBeVisible({ timeout: 90_000 });
  await main.evaluate((el) => {
    if (el.scrollHeight - el.clientHeight > 120) return;
    const existing = el.querySelector("[data-e2e-scroll-spacer]");
    if (existing) return;
    const spacer = document.createElement("div");
    spacer.setAttribute("data-e2e-scroll-spacer", "true");
    spacer.setAttribute("aria-hidden", "true");
    spacer.style.cssText = "height:120vh;pointer-events:none;flex:0 0 auto;";
    el.appendChild(spacer);
  });
  await expect
    .poll(() => main.evaluate((el) => el.scrollHeight - el.clientHeight), {
      timeout: 90_000,
      message: "dashboard main content should have vertical overflow on iPhone",
    })
    .toBeGreaterThan(80);
  return main;
}

async function expectScrollLocksReleased(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const body = document.body;
          const root = document.documentElement;
          return {
            bodyOverflow: body.style.overflow,
            bodyPointerEvents: body.style.pointerEvents,
            hasBodyOverflowHiddenClass: body.classList.contains("overflow-hidden"),
            hasRootOverflowHiddenClass: root.classList.contains("overflow-hidden"),
            rootOverflow: root.style.overflow,
            rootPointerEvents: root.style.pointerEvents,
            scrollLocked: body.getAttribute("data-scroll-locked"),
          };
        }),
      { timeout: 10_000 }
    )
    .toEqual({
      bodyOverflow: "",
      bodyPointerEvents: "",
      hasBodyOverflowHiddenClass: false,
      hasRootOverflowHiddenClass: false,
      rootOverflow: "",
      rootPointerEvents: "",
      scrollLocked: null,
    });
}

async function expectNoInvisibleOverlayAtViewportCenter(page: Page): Promise<void> {
  const blockers = await page.evaluate(() => {
    const x = Math.floor(window.innerWidth / 2);
    const y = Math.floor(window.innerHeight / 2);
    return document.elementsFromPoint(x, y).flatMap((el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const opacity = Number.parseFloat(style.opacity || "1");
      const fixed = style.position === "fixed";
      const large = rect.width > window.innerWidth * 0.6 && rect.height > window.innerHeight * 0.35;
      const blocksPointer = style.pointerEvents !== "none";
      const hidden = style.visibility === "hidden" || opacity < 0.05;
      if (!fixed || !large || !blocksPointer || !hidden) return [];
      return [
        {
          className:
            typeof (el as HTMLElement).className === "string" ? (el as HTMLElement).className : "",
          dataState: el.getAttribute("data-state"),
          role: el.getAttribute("role"),
          tagName: el.tagName.toLowerCase(),
        },
      ];
    });
  });
  expect(blockers, "invisible fixed overlay should not intercept center viewport").toEqual([]);
}

async function expectMainCanScrollDownAndUp(page: Page): Promise<void> {
  const main = await appScrollRoot(page);
  await expectScrollLocksReleased(page);
  await expectNoInvisibleOverlayAtViewportCenter(page);

  const down = await main.evaluate(async (el) => {
    const htmlEl = el as HTMLElement;
    const previousScrollBehavior = htmlEl.style.scrollBehavior;
    htmlEl.style.scrollBehavior = "auto";
    el.scrollTop = 0;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const max = el.scrollHeight - el.clientHeight;
    el.scrollTop = Math.min(520, max);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    htmlEl.style.scrollBehavior = previousScrollBehavior;
    return { max, scrollTop: el.scrollTop };
  });
  expect(down.max).toBeGreaterThan(80);
  expect(down.scrollTop).toBeGreaterThan(40);

  await main.evaluate(async (el) => {
    const htmlEl = el as HTMLElement;
    const previousScrollBehavior = htmlEl.style.scrollBehavior;
    htmlEl.style.scrollBehavior = "auto";
    el.scrollTop = el.scrollHeight;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    el.scrollTop = 0;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    htmlEl.style.scrollBehavior = previousScrollBehavior;
  });
  await expect.poll(() => main.evaluate((el) => el.scrollTop), { timeout: 5_000 }).toBeLessThan(2);
}

async function gotoDashboardShellPage(page: Page, path: string): Promise<void> {
  let response = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      response = await page.goto(path, { waitUntil: "domcontentloaded", timeout: 60_000 });
      break;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt === 0 && message.includes("interrupted by another navigation")) {
        await page.waitForTimeout(500);
        continue;
      }
      throw error;
    }
  }
  expect(response?.status()).not.toBe(500);
  await page
    .locator("[data-app-scroll-root]")
    .first()
    .waitFor({ state: "visible", timeout: 90_000 });
  await expect(page.locator("body")).not.toContainText("Application error");
  await expect(page.locator("body")).not.toContainText("Internal Server Error");
}

test.describe("Dashboard mobile scrolling", () => {
  test.describe.configure({ timeout: 150_000 });

  test("iPhone Safari can scroll dashboard down and back up after route navigation", async ({
    page,
  }) => {
    await gotoDashboardShellPage(page, "/dashboard");
    await expect(page.getByText("HH · Command Center")).toBeVisible({ timeout: 90_000 });
    await expectMainCanScrollDownAndUp(page);

    await gotoDashboardShellPage(page, "/financial/owner");
    await expect(page.getByRole("heading", { name: "Finance dashboard", level: 1 })).toBeVisible({
      timeout: 90_000,
    });
    await expectMainCanScrollDownAndUp(page);

    await gotoDashboardShellPage(page, "/dashboard");
    await expect(page.getByText("HH · Command Center")).toBeVisible({ timeout: 90_000 });
    await expectMainCanScrollDownAndUp(page);

    await page.getByRole("link", { name: /^Expenses$/ }).click();
    await expect(page).toHaveURL(/\/financial\/expenses(?:[?#].*)?$/);
    await expectMainCanScrollDownAndUp(page);

    await page.getByRole("link", { name: /^Dashboard$/ }).click();
    await expect(page).toHaveURL(/\/dashboard(?:[?#].*)?$/);
    await expectMainCanScrollDownAndUp(page);
  });

  test("iPhone Safari recovers scrolling after sheets, dialogs, uploads, and preview overlays", async ({
    page,
  }) => {
    await gotoDashboardShellPage(page, "/financial/expenses");
    await expectMainCanScrollDownAndUp(page);

    await page.getByRole("button", { name: /Filters/i }).click();
    const filtersSheet = page.getByRole("dialog", { name: /Filters & more/i });
    await expect(filtersSheet).toBeVisible({ timeout: 15_000 });
    await filtersSheet.getByRole("button", { name: /^Done$/ }).click();
    await expect(filtersSheet).toBeHidden({ timeout: 10_000 });
    await expectMainCanScrollDownAndUp(page);

    await page
      .getByRole("button", { name: /^Quick$/ })
      .filter({ visible: true })
      .first()
      .click();
    const quickDialog = page.getByRole("dialog", { name: /Quick expense/i });
    await expect(quickDialog).toBeVisible({ timeout: 15_000 });
    await quickDialog.getByRole("button", { name: /^Cancel$/ }).click();
    await expect(quickDialog).toBeHidden({ timeout: 10_000 });
    await expectMainCanScrollDownAndUp(page);

    await page.getByTestId("mobile-upload-receipt").click();
    const uploadDialog = page.getByRole("dialog").filter({ hasText: "Upload receipt" });
    await expect(uploadDialog).toBeVisible({ timeout: 15_000 });
    await uploadDialog.getByTestId("upload-receipt-modal-close").click();
    await expect(uploadDialog).toBeHidden({ timeout: 10_000 });
    await expectMainCanScrollDownAndUp(page);

    await gotoDashboardShellPage(page, "/dashboard");
    await page.evaluate(() => {
      const main = document.querySelector("[data-app-scroll-root]");
      if (!main) return;
      const img = document.createElement("img");
      img.alt = "E2E preview image";
      img.id = "e2e-preview-image";
      img.src =
        "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='160'%20height='120'%20viewBox='0%200%20160%20120'%3E%3Crect%20width='160'%20height='120'%20fill='%23059669'/%3E%3Ctext%20x='80'%20y='66'%20font-size='18'%20text-anchor='middle'%20fill='white'%3EPreview%3C/text%3E%3C/svg%3E";
      img.style.cssText = "display:block;width:160px;height:120px;margin:16px auto;";
      main.prepend(img);
    });
    await page.locator("#e2e-preview-image").click();
    const preview = page.locator("[data-attachment-preview-modal]");
    await expect(preview).toBeVisible({ timeout: 15_000 });
    await preview.getByRole("button", { name: /^Close$/ }).click();
    await expect(preview).toBeHidden({ timeout: 10_000 });
    await expectMainCanScrollDownAndUp(page);

    await page.evaluate(() => {
      document.body.style.overflow = "hidden";
      document.body.style.pointerEvents = "none";
      document.body.setAttribute("data-scroll-locked", "1");
      document.documentElement.classList.add("overflow-hidden");
    });
    await expectScrollLocksReleased(page);
    await expectNoInvisibleOverlayAtViewportCenter(page);
    await expectMainCanScrollDownAndUp(page);
  });
});
