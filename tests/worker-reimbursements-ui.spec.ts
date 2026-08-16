import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { loginAsE2EOwner } from "./e2e-auth-owner";

const IDS = {
  pending: "7a300001-5ab7-4bc4-9200-000000000001",
  approved: "7a300001-5ab7-4bc4-9200-000000000002",
  paid: "7a300001-5ab7-4bc4-9200-000000000003",
} as const;

const WORKER_ID = "22222222-2222-2222-2222-222222222222";
const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const RECEIPT_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='420'%3E%3Crect width='640' height='420' fill='white'/%3E%3Ctext x='40' y='80' font-size='28' fill='%23161616'%3EReimbursement Evidence%3C/text%3E%3C/svg%3E";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Local Supabase admin credentials are required.");
  if (!/localhost|127\.0\.0\.1/.test(url)) {
    throw new Error("Worker Reimbursements UI QA is local-Supabase only.");
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function seedReimbursements() {
  const admin = adminClient();
  await admin.from("worker_reimbursements").delete().in("id", Object.values(IDS));
  const { error } = await admin.from("worker_reimbursements").insert([
    {
      id: IDS.pending,
      worker_id: WORKER_ID,
      project_id: PROJECT_ID,
      vendor: "E2E Reimbursement Supply",
      amount: 135.4,
      description: "Pending materials reimbursement",
      receipt_url: RECEIPT_IMAGE,
      reimbursement_date: "2026-08-14",
      status: "pending",
    },
    {
      id: IDS.approved,
      worker_id: WORKER_ID,
      project_id: PROJECT_ID,
      vendor: "E2E Approved Travel",
      amount: 82.25,
      description: "Approved travel reimbursement",
      receipt_url: null,
      reimbursement_date: "2026-08-13",
      status: "approved",
    },
    {
      id: IDS.paid,
      worker_id: WORKER_ID,
      project_id: PROJECT_ID,
      vendor: "E2E Paid Permit",
      amount: 44,
      description: "Paid permit reimbursement",
      receipt_url: RECEIPT_IMAGE,
      reimbursement_date: "2026-08-12",
      status: "paid",
      paid_at: "2026-08-12T22:00:00.000Z",
    },
  ]);
  if (error) throw new Error(`Unable to seed reimbursement UI fixtures: ${error.message}`);
}

async function cleanupReimbursements() {
  await adminClient().from("worker_reimbursements").delete().in("id", Object.values(IDS));
}

async function openReimbursements(page: Page, viewport = { width: 1440, height: 900 }) {
  await page.setViewportSize(viewport);
  await loginAsE2EOwner(page, "/labor/reimbursements");
  await expect(page.locator("[data-reimbursements-workspace]")).toBeVisible();
}

test.describe.serial("Worker Reimbursements Design System v1", () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeAll(seedReimbursements);
  test.afterAll(cleanupReimbursements);

  test("uses a neutral reimbursement queue with canonical status and relationship hierarchy", async ({
    page,
  }) => {
    await openReimbursements(page);

    const root = page.locator("[data-reimbursements-workspace]");
    await expect(root).toBeVisible();
    await expect(root).toHaveCSS("color-scheme", "light");
    await expect(root.locator("[data-reimbursements-kpis]")).toBeVisible();

    const queue = root.locator("[data-reimbursements-queue]:visible");
    await expect(queue).toBeVisible();
    const pending = queue.locator(`[data-reimbursement-id="${IDS.pending}"]`);
    await expect(pending).toContainText("E2E Reimbursement Supply");
    await expect(pending).toContainText("$135.40");
    await expect(pending).toContainText("Pending");
    await expect(pending).not.toContainText("Ready to pay");
    await expect(pending.getByRole("button", { name: "Preview receipt" })).toBeVisible();

    await pending.locator('label:has(input[type="checkbox"])').click();
    await expect(pending).toHaveAttribute("data-selected", "true");
    await page.getByRole("button", { name: "Create Worker Payment (1)" }).click();
    const batchDialog = page.getByRole("dialog", { name: "Create Worker Payment" });
    await expect(batchDialog).toContainText("E2E Reimbursement Supply");
    await expect(batchDialog).toContainText("$135.40");
    await batchDialog.getByRole("button", { name: "Cancel" }).click();

    await expect(queue.locator(`[data-reimbursement-id="${IDS.approved}"]`)).toContainText(
      "Approved"
    );
    await expect(queue.locator(`[data-reimbursement-id="${IDS.paid}"]`)).toContainText("Paid");
  });

  test("Edit saves through the canonical handler and reopens with the persisted value", async ({
    page,
  }) => {
    await openReimbursements(page);
    const root = page.locator("[data-reimbursements-workspace]");
    const row = root
      .locator("[data-reimbursements-queue]:visible")
      .locator(`[data-reimbursement-id="${IDS.pending}"]`);
    await row.click();

    const form = root.locator("[data-reimbursement-form]");
    await expect(form.getByRole("heading", { name: "Edit Reimbursement" })).toBeVisible();
    await form.getByLabel("Vendor").fill("E2E Reimbursement Supply Updated");
    await form.getByRole("button", { name: "Save" }).click();
    await expect(row).toContainText("E2E Reimbursement Supply Updated");

    await row.click();
    await expect(form.getByLabel("Vendor")).toHaveValue("E2E Reimbursement Supply Updated");
    await form.getByRole("button", { name: "Cancel" }).click();
  });

  test("keeps Mark Paid and mobile queue interactions reachable without overflow", async ({
    page,
  }) => {
    await openReimbursements(page, { width: 390, height: 844 });
    const root = page.locator("[data-reimbursements-workspace]");
    const row = root
      .locator("[data-reimbursements-queue]:visible")
      .locator(`[data-reimbursement-id="${IDS.pending}"]`);
    const actions = row.getByRole("button", { name: "Actions" });
    const actionsBox = await actions.boundingBox();
    expect(actionsBox?.height).toBeGreaterThanOrEqual(44);
    await actions.click();
    await page.getByRole("menuitem", { name: "Mark as Paid" }).click();
    const dialog = page.getByRole("dialog", { name: "Mark as Paid" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Mark as Paid" })).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);

    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await expect(root).toHaveCSS("color-scheme", "dark");

    for (const viewport of [
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
    ]) {
      await page.setViewportSize(viewport);
      await page.reload();
      await expect(page.locator("[data-reimbursements-queue]:visible")).toBeVisible();
      const viewportOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(viewportOverflow).toBeLessThanOrEqual(1);
    }
  });
});
