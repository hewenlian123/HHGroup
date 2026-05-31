import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

import { allowDeleteMutations, e2eTargetOrigin } from "./e2e-env-helpers";
import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";

const BASE = e2eTargetOrigin();
const MARKER_PREFIX = "E2E-BILLS-BOUNDARY";

async function cleanupBillsByMarker(marker: string): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return;
  assertE2ESupabaseUrlSafeForMutations(url);
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
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

async function postBill(request: import("@playwright/test").APIRequestContext, vendorName: string) {
  return request.post(`${BASE}/api/bills`, {
    data: {
      vendor_name: vendorName,
      bill_type: "Vendor",
      amount: 123.45,
      issue_date: new Date().toISOString().slice(0, 10),
      due_date: new Date().toISOString().slice(0, 10),
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
