import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { addE2EOwnerSession } from "./e2e-auth-owner";
import { E2E_PRESERVED_WORKER_ID } from "./e2e-cleanup-db";

const reviewFixture = {
  entries: [
    {
      id: "labor-global-ui-entry",
      worker_id: "labor-global-ui-worker",
      project_id: "labor-global-ui-project",
      work_date: new Date().toISOString().slice(0, 10),
      hours: 4,
      cost_code: "FRM-101",
      notes: "Global UI labor fixture",
    },
  ],
  workers: [{ id: "labor-global-ui-worker", name: "Avery Labor", halfDayRate: 240 }],
  projects: [{ id: "labor-global-ui-project", name: "Payroll Test Project" }],
};

async function expectNoDocumentOverflow(page: Page, width: number) {
  const metrics = await page.evaluate(() => ({
    viewport: window.innerWidth,
    html: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(metrics.viewport).toBe(width);
  expect(Math.max(metrics.html, metrics.body)).toBeLessThanOrEqual(width + 1);
}

test("Labor Review keeps its labor value traceable in dense and stacked records", async ({
  page,
  baseURL,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/labor/entries", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(reviewFixture) });
  });
  await addE2EOwnerSession(page.context(), baseURL!);
  await page.goto("/labor/review", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "Labor Review", level: 1 })).toBeVisible();
  await expect(page.getByRole("region", { name: "Labor review filters" })).toBeVisible();
  await expect(page.getByLabel("Labor review date")).toBeVisible();
  await expect(page.getByLabel("Labor review worker")).toBeVisible();
  await expect(page.getByLabel("Labor review project")).toBeVisible();
  const denseTable = page.getByTestId("labor-review-dense-table");
  await expect(denseTable).toBeVisible();
  await expect(denseTable.getByRole("columnheader", { name: "Total", exact: true })).toBeVisible();
  const denseFixtureRow = denseTable.getByRole("row", { name: /Avery Labor/ });
  await expect(denseFixtureRow).toContainText("$240.00");
  await expect(denseFixtureRow.getByText("$240.00", { exact: true })).toHaveCount(1);

  for (const [width, height] of [
    [1440, 900],
    [1280, 900],
    [1180, 820],
    [820, 1180],
    [390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expectNoDocumentOverflow(page, width);
    if (width < 768) {
      await expect(denseTable).toBeHidden();
      const card = page
        .getByTestId("labor-review-stacked-record")
        .filter({ hasText: "Avery Labor" });
      await expect(card).toBeVisible();
      await expect(card.getByText("Total", { exact: true })).toBeVisible();
      await expect(card.locator("dd").filter({ hasText: "$240.00" })).toBeVisible();
      const review = card.getByRole("button", { name: "Review", exact: true });
      const box = await review.boundingBox();
      expect(box?.height, `${width}px Labor Review action height`).toBeGreaterThanOrEqual(44);
      await review.focus();
      await expect(review).toBeFocused();
    } else {
      await expect(denseTable).toBeVisible();
      if (width === 820) {
        const review = denseTable
          .getByRole("row", { name: /Avery Labor/ })
          .getByRole("button", { name: "Review", exact: true });
        expect(
          (await review.boundingBox())?.height,
          "820px dense Review action height"
        ).toBeGreaterThanOrEqual(44);
        await review.click();
        const drawer = page
          .getByRole("heading", { name: "Review Drawer", exact: true })
          .locator("..");
        await expect(drawer).toBeVisible();
        for (const name of ["Close", "Save changes"]) {
          expect(
            (await drawer.getByRole("button", { name, exact: true }).boundingBox())?.height,
            `820px Review Drawer ${name} action height`
          ).toBeGreaterThanOrEqual(44);
        }
        for (const label of ["Labor review date", "Labor review worker", "Labor review project"]) {
          expect(
            (await page.getByLabel(label).boundingBox())?.height,
            `820px ${label} control height`
          ).toBeGreaterThanOrEqual(44);
        }
      }
    }
  }

  const contrast = await new AxeBuilder({ page })
    .include("main")
    .withRules(["color-contrast"])
    .analyze();
  expect(contrast.violations).toEqual([]);

  expect(errors).toEqual([]);
});

const payrollSummaryFixture = {
  ok: true,
  projects: [{ id: "labor-global-ui-project", name: "Payroll Test Project" }],
  rows: [
    {
      workerId: "labor-global-ui-worker",
      workerName: "Avery Labor",
      laborOwed: 1020.01,
      workerInvoices: 0,
      laborInvoices: 0,
      earned: 1020.01,
      reimbursements: 48.06,
      shouldPay: 1068.07,
      paid: 576.76,
      balance: 491.31,
    },
  ],
};

const workerPaymentsFixture = {
  workers: [{ id: "labor-global-ui-worker", name: "Avery Labor" }],
  projects: [{ id: "labor-global-ui-project", name: "Payroll Test Project" }],
  payments: [
    {
      id: "labor-global-ui-payment",
      workerId: "labor-global-ui-worker",
      projectId: null,
      paymentDate: "2026-09-01",
      amount: 576.76,
      paymentMethod: "Check",
      notes: "Global UI payment fixture",
      createdAt: "2026-09-01T12:00:00.000Z",
      laborEntryIds: null,
    },
  ],
};

async function expectTouchHeight(page: Page, label: string, name: string) {
  const candidates = label
    ? page.getByLabel(label, { exact: true })
    : page
        .getByRole("button", { name, exact: true })
        .or(page.getByRole("link", { name, exact: true }));
  const visibleIndex = await candidates.evaluateAll((elements) =>
    elements.findIndex((element) => {
      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && bounds.height > 0;
    })
  );
  const control = candidates.nth(visibleIndex);
  await expect(control.first()).toBeVisible();
  expect(
    (await control.first().boundingBox())?.height,
    `${label || name} touch target`
  ).toBeGreaterThanOrEqual(44);
}

async function canonicalColorEvidence(page: Page, selector: string) {
  return page
    .locator(selector)
    .first()
    .evaluate((element) => {
      const resolveColor = (token: string) => {
        const reference = document.createElement("span");
        reference.style.color = `var(${token})`;
        document.body.append(reference);
        const color = getComputedStyle(reference).color;
        reference.remove();
        return color;
      };
      const style = getComputedStyle(element);
      return {
        actual: style.color,
        primary: resolveColor("--hh-text-primary"),
        secondary: resolveColor("--hh-text-secondary"),
        success: resolveColor("--hh-success"),
        danger: resolveColor("--hh-danger"),
      };
    });
}

test("Payroll keeps HH colors and 44px tablet controls", async ({ page, baseURL }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("**/api/labor/payroll-summary**", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(payrollSummaryFixture) })
  );
  await page.route("**/api/labor/worker-payments?limit=500", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(workerPaymentsFixture) })
  );
  await addE2EOwnerSession(page.context(), baseURL!);
  await page.setViewportSize({ width: 820, height: 1180 });

  await page.goto("/labor/payroll", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Payroll Summary", exact: true })).toBeVisible();
  await expectTouchHeight(page, "From", "");
  await expectTouchHeight(page, "To", "");
  await expectTouchHeight(page, "Project", "");
  await expectTouchHeight(page, "", "Refresh");
  const payrollAmount = page.getByText("$1,020.01", { exact: true }).first();
  await expect(payrollAmount).toBeVisible();
  const payrollColors = await canonicalColorEvidence(page, "text=$1,020.01");
  expect(payrollColors.actual).toBe(payrollColors.primary);
  await expectNoDocumentOverflow(page, 820);

  const contrast = await new AxeBuilder({ page })
    .include("main")
    .withRules(["color-contrast"])
    .analyze();
  expect(contrast.violations).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("Worker Payments keeps HH colors and 44px tablet controls", async ({ page, baseURL }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("**/api/labor/worker-payments?limit=500", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(workerPaymentsFixture) })
  );
  await addE2EOwnerSession(page.context(), baseURL!);
  await page.setViewportSize({ width: 820, height: 1180 });

  await page.goto("/labor/payments", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Worker Payments", exact: true })).toBeVisible();
  await expectTouchHeight(page, "Search payments and workers", "");
  await expectTouchHeight(page, "", "Filters");
  await expectTouchHeight(page, "", "Refresh");
  await expectTouchHeight(page, "", "Payroll Summary");
  const paymentAmount = page.getByText("$576.76", { exact: true }).first();
  await expect(paymentAmount).toBeVisible();
  const paymentColors = await canonicalColorEvidence(page, "text=$576.76");
  expect(paymentColors.actual).toBe(paymentColors.primary);
  await expectNoDocumentOverflow(page, 820);

  const contrast = await new AxeBuilder({ page })
    .include("main")
    .withRules(["color-contrast"])
    .analyze();
  expect(contrast.violations).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("interactive Worker Statement uses canonical semantic tones", async ({ page, baseURL }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await addE2EOwnerSession(page.context(), baseURL!);
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto(`/workers/${E2E_PRESERVED_WORKER_ID}/statement`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByRole("heading", { name: "Worker Statement", exact: true })).toBeVisible();

  const balanceValue = page
    .getByText("Balance", { exact: true })
    .locator("xpath=following-sibling::*[1]")
    .first();
  await expect(balanceValue).toBeVisible();
  const evidence = await balanceValue.evaluate((element) => {
    const resolveColor = (token: string) => {
      const reference = document.createElement("span");
      reference.style.color = `var(${token})`;
      document.body.append(reference);
      const color = getComputedStyle(reference).color;
      reference.remove();
      return color;
    };
    return {
      actual: getComputedStyle(element).color,
      success: resolveColor("--hh-success"),
      danger: resolveColor("--hh-danger"),
    };
  });
  expect([evidence.success, evidence.danger]).toContain(evidence.actual);
  await expectNoDocumentOverflow(page, 820);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
