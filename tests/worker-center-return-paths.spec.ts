import { expect, test, type Page } from "@playwright/test";

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const LOCAL_APP_BASE = /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i;
const SEED_WORKER_ID = "22222222-2222-2222-2222-222222222222";
const PREFIX = "LOCAL-WORKER-RETURN-QA-DELETE-ME";

function workerDetailPath(tab?: string) {
  return `/workers/${SEED_WORKER_ID}${tab ? `?tab=${tab}` : ""}`;
}

function todayLocalISODate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function goto(page: Page, path: string) {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator("body")).toBeVisible({ timeout: 30_000 });
  await expectNoVisibleAppError(page);
}

async function expectNoVisibleAppError(page: Page) {
  await expect(page.getByRole("heading", { name: /^(404|500|Not found)$/i })).not.toBeVisible();
  await expect(
    page
      .locator("body")
      .getByText(
        /Application error|Unhandled Runtime Error|This page could not be found|Internal Server Error|Something went wrong/i
      )
      .first()
  ).not.toBeVisible();
}

async function cleanupReturnPathRows(page: Page, marker: string) {
  const reimbursements = await page.request.get(`${BASE}/api/worker-reimbursements`);
  if (reimbursements.ok()) {
    const body = (await reimbursements.json().catch(() => null)) as {
      reimbursements?: Array<{ id?: string; vendor?: string | null; description?: string | null }>;
    } | null;
    for (const row of body?.reimbursements ?? []) {
      if (!row.id) continue;
      if (`${row.vendor ?? ""} ${row.description ?? ""}`.includes(marker)) {
        await page.request.delete(
          `${BASE}/api/worker-reimbursements/${encodeURIComponent(row.id)}`
        );
      }
    }
  }

  const advances = await page.request.get(`${BASE}/api/labor/advances?status=active`);
  if (advances.ok()) {
    const body = (await advances.json().catch(() => null)) as {
      advances?: Array<{ id?: string; notes?: string | null }>;
    } | null;
    for (const row of body?.advances ?? []) {
      if (!row.id) continue;
      if ((row.notes ?? "").includes(marker)) {
        await page.request.delete(`${BASE}/api/labor/advances/${encodeURIComponent(row.id)}`);
      }
    }
  }
}

async function expectActiveWorkerTab(page: Page, name: RegExp) {
  await expect(page.getByRole("tab", { name })).toHaveAttribute("data-state", "active", {
    timeout: 30_000,
  });
}

test.describe("Worker Center return paths", () => {
  test("worker detail quick actions expose clear back and cancel paths", async ({ page }) => {
    await goto(page, workerDetailPath());

    await page.getByRole("link", { name: /^Upload Worker Receipt$/i }).click();
    await expect(page.getByRole("heading", { name: /^Worker Receipt Upload$/i })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("link", { name: /^Back to Worker$/i }).click();
    await expect(page).toHaveURL(new RegExp(`/workers/${SEED_WORKER_ID}\\?tab=receipts$`));
    await expectActiveWorkerTab(page, /Receipts & Reimbursements/i);

    await goto(page, workerDetailPath());
    await page.getByRole("link", { name: /^Add Advance$/i }).click();
    const advanceDialog = page.getByRole("dialog", { name: /^Create Advance$/i });
    await expect(advanceDialog).toBeVisible({ timeout: 30_000 });
    await advanceDialog.getByRole("button", { name: /^Cancel$/i }).click();
    await expect(page).toHaveURL(new RegExp(`/workers/${SEED_WORKER_ID}\\?tab=advances$`));
    await expectActiveWorkerTab(page, /^Advances$/i);

    await goto(page, workerDetailPath());
    await page.getByRole("link", { name: /^Add Reimbursement$/i }).click();
    await expect(page.getByRole("heading", { name: /^Worker Reimbursements$/i })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("heading", { name: /^New Reimbursement$/i })).toBeVisible({
      timeout: 30_000,
    });
    await page
      .getByRole("button", { name: /^Cancel$/i })
      .first()
      .click();
    await expect(page).toHaveURL(new RegExp(`/workers/${SEED_WORKER_ID}\\?tab=receipts$`));
    await expectActiveWorkerTab(page, /Receipts & Reimbursements/i);

    await goto(page, workerDetailPath());
    await page.getByRole("link", { name: /^Pay Worker$/i }).click();
    await expect(page.getByRole("link", { name: /^Back to Worker$/i })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("link", { name: /^Back to Worker$/i }).click();
    await expect(page).toHaveURL(new RegExp(`/workers/${SEED_WORKER_ID}\\?tab=payments$`));
    await expectActiveWorkerTab(page, /^Payments$/i);

    await goto(page, workerDetailPath());
    await page
      .getByRole("link", { name: /^Create Statement$/i })
      .first()
      .click();
    await expect(page.getByRole("heading", { name: /^Worker Statement$/i })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("link", { name: /^Back to Worker$/i }).click();
    await expect(page).toHaveURL(new RegExp(`/workers/${SEED_WORKER_ID}\\?tab=statements$`));
    await expectActiveWorkerTab(page, /^Statements$/i);
  });

  test("worker detail advance and reimbursement saves return to the source tab", async ({
    page,
  }) => {
    test.skip(!LOCAL_APP_BASE.test(BASE), "Return-path save smoke only mutates local data.");
    test.setTimeout(120_000);

    const marker = `${PREFIX}-${Date.now()}`;
    try {
      await goto(page, workerDetailPath());
      await page.getByRole("link", { name: /^Add Advance$/i }).click();
      const advanceDialog = page.getByRole("dialog", { name: /^Create Advance$/i });
      await expect(advanceDialog).toBeVisible({ timeout: 30_000 });
      await expect(advanceDialog.locator("select").first()).toHaveValue(SEED_WORKER_ID, {
        timeout: 30_000,
      });
      const advanceAmountInput = advanceDialog.locator('input[type="number"]').first();
      await advanceAmountInput.fill("9.50");
      await expect(advanceAmountInput).toHaveValue("9.50");
      await advanceDialog.locator('input[type="date"]').fill(todayLocalISODate());
      await advanceDialog.getByPlaceholder("Optional").fill(`${marker} advance`);
      const advancePost = page.waitForResponse(
        (res) => res.url().includes("/api/labor/advances") && res.request().method() === "POST",
        { timeout: 45_000 }
      );
      await advanceDialog.getByRole("button", { name: /^Save$/i }).click();
      const advanceResponse = await advancePost;
      expect(advanceResponse.ok()).toBeTruthy();
      await expect(page).toHaveURL(new RegExp(`/workers/${SEED_WORKER_ID}\\?tab=advances$`), {
        timeout: 30_000,
      });
      await expectActiveWorkerTab(page, /^Advances$/i);

      await goto(page, workerDetailPath());
      await page.getByRole("link", { name: /^Add Reimbursement$/i }).click();
      await expect(page.getByRole("heading", { name: /^New Reimbursement$/i })).toBeVisible({
        timeout: 30_000,
      });
      const form = page.locator("form").filter({ hasText: "Receipt URL" }).first();
      await form.getByPlaceholder("Vendor").fill(`${marker} vendor`);
      await form.locator('input[type="number"]').fill("7.25");
      await form.getByPlaceholder("Description").fill(`${marker} reimbursement`);
      await form.getByRole("button", { name: /^Save$/i }).click();
      await expect(page).toHaveURL(new RegExp(`/workers/${SEED_WORKER_ID}\\?tab=receipts$`), {
        timeout: 30_000,
      });
      await expectActiveWorkerTab(page, /Receipts & Reimbursements/i);
    } finally {
      await cleanupReturnPathRows(page, marker);
    }
  });

  test("worker child pages do not horizontally overflow on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const encodedReceiptsReturn = encodeURIComponent(workerDetailPath("receipts"));
    const encodedAdvancesReturn = encodeURIComponent(workerDetailPath("advances"));
    const encodedPaymentsReturn = encodeURIComponent(workerDetailPath("payments"));
    const encodedStatementsReturn = encodeURIComponent(workerDetailPath("statements"));
    const paths = [
      `/upload-receipt?workerId=${SEED_WORKER_ID}&returnTo=${encodedReceiptsReturn}`,
      `/labor/reimbursements?workerId=${SEED_WORKER_ID}&new=1&returnTo=${encodedReceiptsReturn}`,
      `/labor/advances?workerId=${SEED_WORKER_ID}&new=1&returnTo=${encodedAdvancesReturn}`,
      `/labor/workers/${SEED_WORKER_ID}/balance?returnTo=${encodedPaymentsReturn}`,
      `/workers/${SEED_WORKER_ID}/statement?returnTo=${encodedStatementsReturn}`,
    ];

    for (const path of paths) {
      await goto(page, path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
      );
      expect(overflow, path).toBeLessThanOrEqual(1);
    }
  });
});
