import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { loginAsE2EOwner } from "./e2e-auth-owner";

const RECEIPT_IDS = {
  approve: "6a200001-5ab7-4bc4-9200-000000000001",
  reject: "6a200001-5ab7-4bc4-9200-000000000002",
  missing: "6a200001-5ab7-4bc4-9200-000000000003",
} as const;

const WORKER_ID = "22222222-2222-2222-2222-222222222222";
const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const RECEIPT_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='420'%3E%3Crect width='640' height='420' fill='white'/%3E%3Ctext x='40' y='80' font-size='28' fill='%23161616'%3EWorker Receipt QA%3C/text%3E%3C/svg%3E";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Local Supabase admin credentials are required.");
  if (!/localhost|127\.0\.0\.1/.test(url)) {
    throw new Error("Worker Receipts UI QA is local-Supabase only.");
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function seedReceipts() {
  const admin = adminClient();
  await admin.from("worker_receipts").delete().in("id", Object.values(RECEIPT_IDS));
  const { error } = await admin.from("worker_receipts").insert([
    {
      id: RECEIPT_IDS.approve,
      worker_id: WORKER_ID,
      worker_name: "E2E Receipt Worker · Approve",
      project_id: PROJECT_ID,
      expense_type: "Building Materials",
      vendor: "E2E Supply House",
      amount: 184.25,
      description: "Fasteners and anchors",
      notes: "Deterministic evidence fixture",
      receipt_url: RECEIPT_IMAGE,
      receipt_date: "2026-08-14",
      status: "Pending",
      created_at: "2026-08-15T03:00:00.000Z",
    },
    {
      id: RECEIPT_IDS.reject,
      worker_id: WORKER_ID,
      worker_name: "E2E Receipt Worker · Reject",
      project_id: PROJECT_ID,
      expense_type: "Tools",
      vendor: "E2E Tool Shop",
      amount: 42.5,
      receipt_url: RECEIPT_IMAGE,
      receipt_date: "2026-08-13",
      status: "Pending",
      created_at: "2026-08-15T02:00:00.000Z",
    },
    {
      id: RECEIPT_IDS.missing,
      worker_id: WORKER_ID,
      worker_name: "E2E Receipt Worker · Missing",
      project_id: null,
      expense_type: "Other",
      vendor: null,
      amount: 16,
      receipt_url: null,
      receipt_date: null,
      status: "Pending",
      created_at: "2026-08-15T01:00:00.000Z",
    },
  ]);
  if (error) throw new Error(`Unable to seed Worker Receipts QA fixtures: ${error.message}`);
}

async function cleanupReceipts() {
  const admin = adminClient();
  const { data } = await admin
    .from("worker_receipts")
    .select("reimbursement_id")
    .in("id", Object.values(RECEIPT_IDS));
  const reimbursementIds = (data ?? [])
    .map((row) => row.reimbursement_id as string | null)
    .filter((id): id is string => Boolean(id));
  await admin.from("worker_receipts").delete().in("id", Object.values(RECEIPT_IDS));
  if (reimbursementIds.length > 0) {
    await admin.from("worker_reimbursements").delete().in("id", reimbursementIds);
  }
}

async function openWorkerReceipts(page: Page, viewport = { width: 1440, height: 900 }) {
  await page.setViewportSize(viewport);
  await loginAsE2EOwner(page, "/financial/inbox/worker");
  await expect(page.getByRole("heading", { name: "Worker Submitted", exact: true })).toBeVisible();
}

test.describe.serial("Worker Receipts Design System v1 workspace", () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeAll(seedReceipts);
  test.afterAll(cleanupReceipts);

  test("desktop keeps a scan-first queue and contextual evidence detail", async ({ page }) => {
    await openWorkerReceipts(page);

    const root = page.locator("[data-worker-receipts-workspace]");
    await expect(root).toBeVisible();
    await expect(root).toHaveCSS("color-scheme", "light");

    const split = root.locator("[data-worker-receipts-master-detail]");
    await expect(split).toBeVisible();
    const splitBox = await split.boundingBox();
    expect(splitBox?.width ?? 0).toBeGreaterThan(1000);

    const queue = root.locator("[data-worker-receipts-queue]");
    const row = queue.locator(`[data-worker-receipt-id="${RECEIPT_IDS.approve}"]`);
    await expect(row).toContainText("E2E Receipt Worker · Approve");
    await expect(row).toContainText("$184.25");
    await row.click();
    await expect(row).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveURL(new RegExp(`ops_record=${RECEIPT_IDS.approve}`));

    const detail = root.locator("[data-worker-receipts-detail]");
    const evidenceStage = root.locator("[data-worker-receipts-evidence-stage]");
    await expect(evidenceStage).toBeVisible();
    await expect(detail).toContainText("E2E Receipt Worker · Approve");
    await expect(detail).toContainText("$184.25");
    await expect(evidenceStage.getByRole("img", { name: /Receipt evidence/i })).toBeVisible();
    await expect(detail).toContainText("1 of 3");
    await expect(detail.getByRole("button", { name: "Previous" })).toBeDisabled();
    await expect(detail.getByRole("button", { name: "Next", exact: true })).toBeEnabled();
    await expect(
      detail.getByRole("button", { name: "Approve and review next receipt" })
    ).toBeVisible();
    await expect(detail.getByRole("button", { name: "Reject receipt" })).toBeVisible();

    const workspaceOrder = await root.evaluate((element) => {
      const queue = element.querySelector<HTMLElement>("[data-worker-receipts-queue]");
      const evidence = element.querySelector<HTMLElement>("[data-worker-receipts-evidence-stage]");
      const review = element.querySelector<HTMLElement>("[data-worker-receipts-detail]");
      if (!queue || !evidence || !review) return null;
      const queueBox = queue.getBoundingClientRect();
      const evidenceBox = evidence.getBoundingClientRect();
      const reviewBox = review.getBoundingClientRect();
      return {
        queueRight: queueBox.right,
        evidenceLeft: evidenceBox.left,
        evidenceRight: evidenceBox.right,
        reviewLeft: reviewBox.left,
      };
    });
    expect(workspaceOrder).not.toBeNull();
    expect(workspaceOrder!.queueRight).toBeLessThanOrEqual(workspaceOrder!.evidenceLeft + 2);
    expect(workspaceOrder!.evidenceRight).toBeLessThanOrEqual(workspaceOrder!.reviewLeft + 2);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-worker-receipts-detail]")).toContainText(
      "E2E Receipt Worker · Approve"
    );
    await expect(row).toHaveAttribute("aria-selected", "true");
  });

  test("failed Approve & Next preserves the selected receipt and queue context", async ({
    page,
  }) => {
    await openWorkerReceipts(page);
    const root = page.locator("[data-worker-receipts-workspace]");
    const row = root.locator(`[data-worker-receipt-id="${RECEIPT_IDS.approve}"]`);
    await row.click();
    await page.route(`**/api/worker-receipts/${RECEIPT_IDS.approve}/approve`, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ message: "Owner QA forced approve failure" }),
      });
    });

    await root.getByRole("button", { name: "Approve and review next receipt" }).click();
    await expect(root.getByRole("alert")).toContainText("Owner QA forced approve failure");
    await expect(row).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveURL(new RegExp(`ops_record=${RECEIPT_IDS.approve}`));
  });

  test("Approve and Reject complete through the protected canonical actions", async ({ page }) => {
    await openWorkerReceipts(page);
    const root = page.locator("[data-worker-receipts-workspace]");
    const statusFilter = root.locator('select[aria-label="Filter by status"]:visible');
    await statusFilter.selectOption("Pending");

    await root.locator(`[data-worker-receipt-id="${RECEIPT_IDS.approve}"]`).click();
    const approveResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/worker-receipts/${RECEIPT_IDS.approve}/approve`) &&
        response.request().method() === "POST"
    );
    await root.getByRole("button", { name: "Approve and review next receipt" }).click();
    const approveResponse = await approveResponsePromise;
    const approveBody = await approveResponse.json();
    expect(approveResponse.ok(), JSON.stringify(approveBody)).toBeTruthy();
    expect(approveBody.receipt?.status).toBe("Approved");
    await expect(root.locator(`[data-worker-receipt-id="${RECEIPT_IDS.approve}"]`)).toHaveCount(0);
    await expect(
      root.getByRole("link", { name: "View Reimbursements", exact: true })
    ).toBeVisible();
    await expect(root.locator(`[data-worker-receipt-id="${RECEIPT_IDS.reject}"]`)).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await expect(page).toHaveURL(new RegExp(`ops_record=${RECEIPT_IDS.reject}`));
    await expect(statusFilter).toHaveValue("Pending");

    await root.getByRole("button", { name: "Reject receipt" }).click();
    const rejectDialog = page.getByRole("dialog", { name: "Reject receipt" });
    await expect(rejectDialog).toBeVisible();
    await rejectDialog.getByLabel("Reason (optional)").fill("Targeted owner QA");
    const rejectResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/worker-receipts/${RECEIPT_IDS.reject}/reject`) &&
        response.request().method() === "POST"
    );
    await rejectDialog.getByRole("button", { name: "Reject & Next", exact: true }).click();
    const rejectResponse = await rejectResponsePromise;
    const rejectBody = await rejectResponse.json();
    expect(rejectResponse.ok(), JSON.stringify(rejectBody)).toBeTruthy();
    expect(rejectBody.receipt?.status).toBe("Rejected");
    await expect(rejectDialog).toBeHidden();
    await expect(root.locator(`[data-worker-receipt-id="${RECEIPT_IDS.reject}"]`)).toHaveCount(0);
    await expect(root.locator(`[data-worker-receipt-id="${RECEIPT_IDS.missing}"]`)).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await expect(page).toHaveURL(new RegExp(`ops_record=${RECEIPT_IDS.missing}`));
    await expect(statusFilter).toHaveValue("Pending");
  });

  test("landscape keeps Master–Detail while portrait adapts to a detail sheet", async ({
    page,
  }) => {
    await openWorkerReceipts(page, { width: 1024, height: 768 });
    let root = page.locator("[data-worker-receipts-workspace]");
    await root.locator(`[data-worker-receipt-id="${RECEIPT_IDS.approve}"]`).click();
    await expect(root.locator("[data-worker-receipts-detail]")).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Worker receipt detail" })).toBeHidden();

    await page.setViewportSize({ width: 768, height: 1024 });
    await page.reload();
    root = page.locator("[data-worker-receipts-workspace]");
    await expect(root.locator("[data-worker-receipts-evidence-stage]")).toBeHidden();
    await root.locator(`[data-worker-receipt-id="${RECEIPT_IDS.missing}"]`).click();
    const sheet = page.getByRole("dialog", { name: "Worker receipt detail" });
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText("Missing receipt evidence");
    await expect(sheet.getByRole("button", { name: "Close detail" })).toBeVisible();
  });

  test("mobile stays touch-safe and Light/Dark tokens remain coherent", async ({ page }) => {
    await openWorkerReceipts(page, { width: 390, height: 844 });
    const root = page.locator("[data-worker-receipts-workspace]");
    await expect(root.locator("[data-worker-receipts-detail]")).toBeHidden();

    await root.locator(`[data-worker-receipt-id="${RECEIPT_IDS.missing}"]`).click();
    const sheet = page.getByRole("dialog", { name: "Worker receipt detail" });
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText("Missing receipt evidence");
    await expect(sheet.getByRole("button", { name: "Close detail" })).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);

    await sheet.getByRole("button", { name: "Close detail" }).click();
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await expect(root).toHaveCSS("color-scheme", "dark");
    await expect(root.locator("[data-worker-receipts-queue]")).toHaveCSS(
      "background-color",
      "rgb(24, 24, 24)"
    );
  });
});
