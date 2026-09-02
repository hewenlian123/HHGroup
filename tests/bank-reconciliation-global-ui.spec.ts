import { expect, test, type Page, type Route } from "@playwright/test";

import { addE2EOwnerSession } from "./e2e-auth-owner";

type ResponseMode = "data" | "empty" | "error" | "loading";

const bankFixture = {
  transactions: [
    {
      id: "bank-global-ui-outgoing",
      date: "2026-08-31",
      description: "Home Depot materials",
      amount: -1234.56,
      status: "unmatched",
      reconciledAt: null,
      linkedExpenseId: null,
      reconcileType: null,
    },
    {
      id: "bank-global-ui-income",
      date: "2026-08-30",
      description: "Client progress payment",
      amount: 3450,
      status: "reconciled",
      reconciledAt: "2026-08-31T12:00:00.000Z",
      linkedExpenseId: null,
      reconcileType: "Income",
    },
  ],
  projects: [{ id: "project-global-ui", name: "HH Test Project" }],
  categories: ["Materials", "Other"],
  vendors: ["Home Depot"],
  paymentMethods: ["ACH", "Card"],
};

async function fulfillBankRoute(route: Route, mode: Exclude<ResponseMode, "loading">) {
  if (mode === "error") {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ message: "Bank feed unavailable." }),
    });
    return;
  }

  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(mode === "empty" ? { ...bankFixture, transactions: [] } : bankFixture),
  });
}

async function expectNoDocumentOverflow(page: Page, width: number) {
  const metrics = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  expect(metrics.viewportWidth).toBe(width);
  expect(Math.max(metrics.documentWidth, metrics.bodyWidth)).toBeLessThanOrEqual(width + 1);
}

test("Bank reconciliation uses the HH dense desktop and stacked touch composition", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
  page.on("pageerror", (error) => errors.push(error.message));

  await page.route("**/api/financial/bank-transactions?view=reconcile", async (route) => {
    await fulfillBankRoute(route, "data");
  });
  await addE2EOwnerSession(page.context(), baseURL!);
  await page.goto("/financial/bank", { waitUntil: "domcontentloaded" });

  const workspace = page.getByTestId("bank-reconciliation-workspace");
  await expect(workspace).toBeVisible();
  await expect(page.getByRole("heading", { name: "Bank Reconcile", level: 1 })).toBeVisible();
  await expect(page.getByRole("region", { name: "Bank transaction filters" })).toBeVisible();
  await expect(page.getByText("Home Depot materials").first()).toBeVisible();
  await expect(page.getByText("-$1,234.56").first()).toBeVisible();
  await expect(page.getByText("Unmatched").first()).toBeVisible();
  await page.getByRole("button", { name: /^reconciled$/i }).click();
  await expect(page.getByText("Client progress payment").first()).toBeVisible();
  await expect(page.getByText("$3,450.00").first()).toBeVisible();
  await expect(page.getByText("Matched").first()).toBeVisible();
  await page.getByRole("button", { name: /^unmatched$/i }).click();

  for (const [width, height] of [
    [1440, 900],
    [1280, 800],
    [1180, 820],
    [820, 1180],
    [390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expectNoDocumentOverflow(page, width);

    if (width <= 820) {
      const allFilter = page.getByRole("button", { name: /^all$/i });
      const filterBox = await allFilter.boundingBox();
      expect(filterBox, `${width}px Bank All filter geometry`).not.toBeNull();
      expect(filterBox!.width, `${width}px Bank All filter width`).toBeGreaterThanOrEqual(44);
      expect(filterBox!.height, `${width}px Bank All filter height`).toBeGreaterThanOrEqual(44);
    }

    if (width >= 1024) {
      await expect(page.getByTestId("bank-transactions-dense-table")).toBeVisible();
      await expect(page.getByTestId("bank-transactions-stacked-list")).toBeHidden();
    } else {
      await expect(page.getByTestId("bank-transactions-dense-table")).toBeHidden();
      await expect(page.getByTestId("bank-transactions-stacked-list")).toBeVisible();
      const selectTarget = page.getByRole("button", {
        name: "Select transaction Home Depot materials",
      });
      const mobileCard = page
        .getByTestId("bank-transactions-stacked-list")
        .locator('[data-neo-mobile-card="true"]')
        .filter({ hasText: "Home Depot materials" });
      await expect(mobileCard.getByText("Aug 31 · 2026", { exact: true })).toBeVisible();
      const box = await selectTarget.boundingBox();
      expect(box).not.toBeNull();
      expect(Math.min(box!.width, box!.height)).toBeGreaterThanOrEqual(44);
      if (width === 820) {
        const unselectedBackground = await mobileCard.evaluate(
          (element) => getComputedStyle(element).backgroundColor
        );
        await selectTarget.click();
        await expect(selectTarget).toHaveAttribute("aria-pressed", "true");
        await expect(mobileCard).not.toHaveAttribute("aria-selected");
        await expect
          .poll(() => mobileCard.evaluate((element) => getComputedStyle(element).backgroundColor))
          .not.toBe(unselectedBackground);
      }
    }
  }

  expect(errors).toEqual([]);
});

test("Bank reconciliation exposes explicit loading, empty, and error states", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(120_000);
  let mode: ResponseMode = "loading";
  let releaseLoading: (() => void) | undefined;

  await page.route("**/api/financial/bank-transactions?view=reconcile", async (route) => {
    if (mode === "loading") {
      await new Promise<void>((resolve) => {
        releaseLoading = resolve;
      });
    }
    await fulfillBankRoute(route, mode === "loading" ? "data" : mode);
  });
  await addE2EOwnerSession(page.context(), baseURL!);
  await page.goto("/financial/bank", { waitUntil: "domcontentloaded" });

  await expect(
    page.getByRole("status").filter({ hasText: "Loading bank transactions" })
  ).toBeVisible();
  mode = "data";
  releaseLoading?.();
  await expect(page.getByText("Home Depot materials").first()).toBeVisible();

  mode = "empty";
  await addE2EOwnerSession(page.context(), baseURL!);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText("No bank transactions match these filters.").first()).toBeVisible();

  mode = "error";
  await addE2EOwnerSession(page.context(), baseURL!);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("bank-reconciliation-workspace").getByRole("alert")).toContainText(
    "Bank feed unavailable."
  );
});
