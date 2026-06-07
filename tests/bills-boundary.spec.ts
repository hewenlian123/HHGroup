import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

import { allowDeleteMutations, e2eTargetOrigin } from "./e2e-env-helpers";
import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";

const BASE = e2eTargetOrigin();
const MARKER_PREFIX = "FIX-BILLS-SAFE";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseCurrencyText(value: string): number {
  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function cents(value: number): number {
  return Math.round(value * 100);
}

async function outstandingKpiAmount(page: import("@playwright/test").Page): Promise<number> {
  const text = await page
    .locator("section")
    .filter({ hasText: "Outstanding" })
    .getByText(/\$[\d,]+(?:\.\d{2})?/)
    .first()
    .innerText();
  return parseCurrencyText(text);
}

function supabaseForLocalMutations() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return null;
  assertE2ESupabaseUrlSafeForMutations(url);
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function cleanupBillsByMarker(marker: string): Promise<void> {
  const supabase = supabaseForLocalMutations();
  if (!supabase) return;
  const { data: rows, error } = await supabase
    .from("ap_bills")
    .select("id")
    .ilike("vendor_name", `%${marker}%`);
  if (error) return;
  for (const row of rows ?? []) {
    if (!row.id) continue;
    await supabase.from("ap_bill_payments").delete().eq("bill_id", row.id);
    await supabase.from("ap_bills").delete().eq("id", row.id);
  }
}

async function postBill(
  request: import("@playwright/test").APIRequestContext,
  vendorName: string,
  options: { amount?: number; dueDate?: string; billNo?: string | null } = {}
) {
  return request.post(`${BASE}/api/bills`, {
    data: {
      bill_no: options.billNo ?? null,
      vendor_name: vendorName,
      bill_type: "Vendor",
      amount: options.amount ?? 123.45,
      issue_date: new Date().toISOString().slice(0, 10),
      due_date: options.dueDate ?? new Date().toISOString().slice(0, 10),
      category: "Boundary",
      notes: "safe to delete local boundary test",
    },
  });
}

test.describe("Bills/AP guarded server boundary", () => {
  test("bills API rejects anonymous production-locked requests", async ({ request }) => {
    const response = await request.get(`${BASE}/api/bills`, {
      headers: { "x-hh-production-safety-lock": "1" },
    });
    if (response.status() === 200) {
      test.skip(true, "Local owner no-login mode allows guarded API access.");
    }
    expect([401, 403]).toContain(response.status());
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    expect(body.message ?? "").toMatch(/auth|access|required/i);
  });

  test("API create, edit, payment, void, and draft delete stay behind guarded endpoints", async ({
    page,
    request,
  }, testInfo) => {
    test.setTimeout(120_000);
    test.skip(!allowDeleteMutations(testInfo), "Bills/AP mutations are disabled for this target.");

    const marker = `${MARKER_PREFIX}-${Date.now()}`;
    await cleanupBillsByMarker(marker);

    try {
      const createResponse = await postBill(request, marker);
      if (createResponse.status() === 503) {
        test.skip(true, "Bills/AP schema is unavailable in this environment.");
      }
      expect(createResponse.ok(), await createResponse.text()).toBeTruthy();
      const createBody = (await createResponse.json()) as { bill?: { id?: string } };
      const billId = createBody.bill?.id;
      expect(billId).toMatch(/^[0-9a-f-]{36}$/i);

      const editedVendor = `${marker}-EDITED`;
      const editResponse = await request.patch(`${BASE}/api/bills/${billId}`, {
        data: {
          vendor_name: editedVendor,
          bill_type: "Vendor",
          amount: 150,
          category: "Boundary edited",
        },
      });
      expect(editResponse.ok(), await editResponse.text()).toBeTruthy();

      const paymentResponse = await request.post(`${BASE}/api/bills/${billId}/payments`, {
        data: {
          payment_date: new Date().toISOString().slice(0, 10),
          amount: 50,
          payment_method: "Check",
          reference_no: marker,
        },
      });
      expect(paymentResponse.ok(), await paymentResponse.text()).toBeTruthy();

      const detailResponse = await request.get(`${BASE}/api/bills/${billId}`);
      expect(detailResponse.ok(), await detailResponse.text()).toBeTruthy();
      const detailBody = (await detailResponse.json()) as {
        bill?: { vendor_name?: string };
        payments?: Array<{ amount?: number; reference_no?: string }>;
      };
      expect(detailBody.bill?.vendor_name).toBe(editedVendor);
      expect(detailBody.payments?.some((p) => p.amount === 50 && p.reference_no === marker)).toBe(
        true
      );

      await page.goto(`${BASE}/bills`);
      await expect(page.locator("tbody tr").filter({ hasText: editedVendor })).toBeVisible({
        timeout: 30_000,
      });
      await page.goto(`${BASE}/bills/${billId}`);
      await expect(page.getByText(editedVendor).first()).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText("Check")).toBeVisible({ timeout: 30_000 });

      const voidResponse = await request.patch(`${BASE}/api/bills/${billId}`, {
        data: { action: "void" },
      });
      expect(voidResponse.ok(), await voidResponse.text()).toBeTruthy();

      const missingDelete = await request.delete(
        `${BASE}/api/bills/00000000-0000-0000-0000-000000000000`
      );
      expect(missingDelete.status()).toBe(404);

      const draftVendor = `${marker}-DRAFT`;
      const draftResponse = await postBill(request, draftVendor);
      expect(draftResponse.ok(), await draftResponse.text()).toBeTruthy();
      const draftBody = (await draftResponse.json()) as { bill?: { id?: string } };
      const draftId = draftBody.bill?.id;
      expect(draftId).toMatch(/^[0-9a-f-]{36}$/i);
      const deleteResponse = await request.delete(`${BASE}/api/bills/${draftId}`);
      expect(deleteResponse.ok(), await deleteResponse.text()).toBeTruthy();
      const deletedDetail = await request.get(`${BASE}/api/bills/${draftId}`);
      expect(deletedDetail.status()).toBe(404);
    } finally {
      await cleanupBillsByMarker(marker);
    }
  });

  test("paid and partially paid bill amount edits are rejected at the API boundary", async ({
    request,
  }, testInfo) => {
    test.skip(!allowDeleteMutations(testInfo), "Bills/AP mutations are disabled for this target.");

    const marker = `${MARKER_PREFIX}-LOCK-${Date.now()}`;
    await cleanupBillsByMarker(marker);

    try {
      const paidResponse = await postBill(request, `${marker}-PAID`, { amount: 1200.25 });
      if (paidResponse.status() === 503) {
        test.skip(true, "Bills/AP schema is unavailable in this environment.");
      }
      expect(paidResponse.ok(), await paidResponse.text()).toBeTruthy();
      const paidBody = (await paidResponse.json()) as { bill?: { id?: string } };
      const paidId = paidBody.bill?.id;
      expect(paidId).toMatch(/^[0-9a-f-]{36}$/i);

      const paidPaymentResponse = await request.post(`${BASE}/api/bills/${paidId}/payments`, {
        data: {
          payment_date: new Date().toISOString().slice(0, 10),
          amount: 1200.25,
          payment_method: "Check",
          reference_no: `${marker}-PAID`,
        },
      });
      expect(paidPaymentResponse.ok(), await paidPaymentResponse.text()).toBeTruthy();

      const paidEditResponse = await request.patch(`${BASE}/api/bills/${paidId}`, {
        data: { amount: 1000 },
      });
      expect(paidEditResponse.status()).toBe(400);
      const paidEditBody = (await paidEditResponse.json().catch(() => ({}))) as {
        message?: string;
      };
      expect(paidEditBody.message ?? "").toMatch(/Paid bills cannot be edited directly/i);

      const paidDetailResponse = await request.get(`${BASE}/api/bills/${paidId}`);
      expect(paidDetailResponse.ok(), await paidDetailResponse.text()).toBeTruthy();
      const paidDetail = (await paidDetailResponse.json()) as {
        bill?: { amount?: number; paid_amount?: number; balance_amount?: number; status?: string };
      };
      expect(paidDetail.bill?.amount).toBe(1200.25);
      expect(paidDetail.bill?.paid_amount).toBe(1200.25);
      expect(paidDetail.bill?.balance_amount).toBe(0);
      expect(paidDetail.bill?.status).toBe("Paid");
      expect((paidDetail.bill?.paid_amount ?? 0) <= (paidDetail.bill?.amount ?? 0)).toBe(true);

      const partialResponse = await postBill(request, `${marker}-PARTIAL`, { amount: 1000 });
      expect(partialResponse.ok(), await partialResponse.text()).toBeTruthy();
      const partialBody = (await partialResponse.json()) as { bill?: { id?: string } };
      const partialId = partialBody.bill?.id;
      expect(partialId).toMatch(/^[0-9a-f-]{36}$/i);

      const partialPaymentResponse = await request.post(`${BASE}/api/bills/${partialId}/payments`, {
        data: {
          payment_date: new Date().toISOString().slice(0, 10),
          amount: 400,
          payment_method: "ACH",
          reference_no: `${marker}-PARTIAL`,
        },
      });
      expect(partialPaymentResponse.ok(), await partialPaymentResponse.text()).toBeTruthy();

      const partialEditResponse = await request.patch(`${BASE}/api/bills/${partialId}`, {
        data: { amount: 300 },
      });
      expect(partialEditResponse.status()).toBe(400);
      const partialEditBody = (await partialEditResponse.json().catch(() => ({}))) as {
        message?: string;
      };
      expect(partialEditBody.message ?? "").toMatch(/Paid bills cannot be edited directly/i);

      const partialDetailResponse = await request.get(`${BASE}/api/bills/${partialId}`);
      expect(partialDetailResponse.ok(), await partialDetailResponse.text()).toBeTruthy();
      const partialDetail = (await partialDetailResponse.json()) as {
        bill?: { amount?: number; paid_amount?: number; balance_amount?: number; status?: string };
      };
      expect(partialDetail.bill?.amount).toBe(1000);
      expect(partialDetail.bill?.paid_amount).toBe(400);
      expect(partialDetail.bill?.balance_amount).toBe(600);
      expect(partialDetail.bill?.status).toBe("Partially Paid");
      expect((partialDetail.bill?.paid_amount ?? 0) <= (partialDetail.bill?.amount ?? 0)).toBe(
        true
      );
    } finally {
      await cleanupBillsByMarker(marker);
    }
  });

  test("Bills list approves draft rows, deletes drafts from overflow, and keeps void rows behind filter", async ({
    page,
    request,
  }, testInfo) => {
    test.setTimeout(120_000);
    test.skip(!allowDeleteMutations(testInfo), "Bills/AP mutations are disabled for this target.");

    const marker = `${MARKER_PREFIX}-ACTIONS-${Date.now()}`;
    const approveVendor = `${marker}-APPROVE`;
    const draftVendor = `${marker}-DRAFT`;
    const voidVendor = `${marker}-VOID`;
    await cleanupBillsByMarker(marker);

    try {
      const approveResponse = await postBill(request, approveVendor, { amount: 222.22 });
      if (approveResponse.status() === 503) {
        test.skip(true, "Bills/AP schema is unavailable in this environment.");
      }
      expect(approveResponse.ok(), await approveResponse.text()).toBeTruthy();
      const approveBody = (await approveResponse.json()) as { bill?: { id?: string } };
      const approveId = approveBody.bill?.id;
      expect(approveId).toMatch(/^[0-9a-f-]{36}$/i);

      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`${BASE}/bills?search=${encodeURIComponent(approveVendor)}`);
      await expect(page.getByRole("heading", { name: /^Bills$/ })).toBeVisible({
        timeout: 60_000,
      });
      const approveRow = page.locator("tbody tr").filter({ hasText: approveVendor });
      await expect(approveRow).toBeVisible({ timeout: 30_000 });
      await expect(approveRow).toContainText("Draft");

      await approveRow
        .getByRole("button", {
          name: new RegExp(`Actions for bill ${escapeRegExp(approveVendor)}`, "i"),
        })
        .click();
      await expect(page.getByRole("menuitem", { name: /^Open$/ })).toBeVisible();
      await expect(page.getByRole("menuitem", { name: /^Approve$/ })).toBeVisible();
      await expect(page.getByRole("menuitem", { name: /^Delete$/ })).toBeVisible();
      await expect(page.getByRole("menuitem", { name: /^(Pay|Add payment)$/ })).toHaveCount(0);
      await page.getByRole("menuitem", { name: /^Approve$/ }).click();
      await expect(approveRow).toContainText("Pending", { timeout: 30_000 });

      await approveRow
        .getByRole("button", {
          name: new RegExp(`Actions for bill ${escapeRegExp(approveVendor)}`, "i"),
        })
        .click();
      await expect(page.getByRole("menuitem", { name: /^Pay$/ })).toBeVisible();
      await expect(page.getByRole("menuitem", { name: /^Void$/ })).toBeVisible();
      await expect(page.getByRole("menuitem", { name: /^Delete$/ })).toHaveCount(0);
      await page.getByRole("menuitem", { name: /^Pay$/ }).click();

      await expect(page).toHaveURL(new RegExp(`/bills/${approveId}\\?addPayment=1`));
      const payDialog = page.getByRole("dialog", { name: "Add payment" });
      await expect(payDialog).toBeVisible({ timeout: 30_000 });
      await payDialog.getByRole("spinbutton").fill("222.22");
      await payDialog.getByRole("button", { name: /^Add payment$/ }).click();
      await expect(payDialog).toHaveCount(0, { timeout: 30_000 });
      await expect(page.getByText(/^Paid$/).first()).toBeVisible({ timeout: 30_000 });

      await page.getByRole("link", { name: /^Edit bill$/ }).click();
      await expect(page).toHaveURL(new RegExp(`/bills/${approveId}/edit`));
      await expect(page.getByRole("spinbutton")).toBeDisabled();
      await expect(page.getByText("Paid bills are locked to protect AP history.")).toBeVisible();

      const draftResponse = await postBill(request, draftVendor, { amount: 321.45 });
      expect(draftResponse.ok(), await draftResponse.text()).toBeTruthy();
      const draftBody = (await draftResponse.json()) as { bill?: { id?: string } };
      expect(draftBody.bill?.id).toMatch(/^[0-9a-f-]{36}$/i);

      await page.goto(`${BASE}/bills?search=${encodeURIComponent(draftVendor)}`);
      await expect(page.getByRole("heading", { name: /^Bills$/ })).toBeVisible({
        timeout: 60_000,
      });
      const draftRow = page.locator("tbody tr").filter({ hasText: draftVendor });
      await expect(draftRow).toBeVisible({ timeout: 30_000 });
      await expect(draftRow).toContainText("Draft");
      const outstandingBeforeDelete = await outstandingKpiAmount(page);

      await draftRow
        .getByRole("button", {
          name: new RegExp(`Actions for bill ${escapeRegExp(draftVendor)}`, "i"),
        })
        .click();
      await page.getByRole("menuitem", { name: /^Delete$/ }).click();
      const deleteDialog = page.getByRole("dialog", { name: "Delete bill?" });
      await expect(deleteDialog).toContainText("This will permanently delete this bill.");
      const deleteResponsePromise = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/bills/${draftBody.bill?.id}`) &&
          response.request().method() === "DELETE"
      );
      await deleteDialog.getByRole("button", { name: /^Delete$/ }).click();
      const deleteResponse = await deleteResponsePromise;
      expect(deleteResponse.ok()).toBeTruthy();
      await expect(draftRow).toHaveCount(0, { timeout: 30_000 });
      await expect
        .poll(async () => cents(await outstandingKpiAmount(page)), {
          timeout: 15_000,
        })
        .toBe(cents(outstandingBeforeDelete - 321.45));

      const voidResponse = await postBill(request, voidVendor);
      expect(voidResponse.ok(), await voidResponse.text()).toBeTruthy();
      const voidBody = (await voidResponse.json()) as { bill?: { id?: string } };
      const voidId = voidBody.bill?.id;
      expect(voidId).toMatch(/^[0-9a-f-]{36}$/i);
      const markVoidResponse = await request.patch(`${BASE}/api/bills/${voidId}`, {
        data: { action: "void" },
      });
      expect(markVoidResponse.ok(), await markVoidResponse.text()).toBeTruthy();

      await page.goto(`${BASE}/bills?search=${encodeURIComponent(voidVendor)}`);
      await expect(page.getByRole("heading", { name: /^Bills$/ })).toBeVisible({
        timeout: 60_000,
      });
      await expect(page.locator("tbody tr").filter({ hasText: voidVendor })).toHaveCount(0, {
        timeout: 30_000,
      });
      await page.getByRole("checkbox", { name: /Show void bills/i }).check();
      await expect(page.locator("tbody tr").filter({ hasText: voidVendor })).toBeVisible({
        timeout: 30_000,
      });
    } finally {
      await cleanupBillsByMarker(marker);
    }
  });

  test("active Bills UI sources do not import browser AP mutation helpers", async () => {
    const root = process.cwd();
    const activeFiles = [
      "src/app/bills/new/new-bill-client.tsx",
      "src/app/bills/[id]/edit/edit-bill-client.tsx",
      "src/app/bills/[id]/bill-detail-client.tsx",
      "src/app/bills/bills-list-client.tsx",
    ];
    const forbidden =
      /\b(createApBill|updateApBill|addApBillPayment|voidBillAction|deleteBillDraftAction)\b/;

    for (const file of activeFiles) {
      const source = fs.readFileSync(path.join(root, file), "utf8");
      expect(source, file).not.toMatch(forbidden);
    }
  });
});
