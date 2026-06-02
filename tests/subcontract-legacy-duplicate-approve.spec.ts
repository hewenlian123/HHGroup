import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { approveSubcontractBill } from "@/lib/subcontract-bills-db";
import { allowDeleteMutations, e2eTargetOrigin } from "./e2e-env-helpers";
import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";

const BASE = e2eTargetOrigin();
const LOAD_MS = 60_000;

type Supabase = SupabaseClient;

function supabaseForLocalMutations(): Supabase | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  assertE2ESupabaseUrlSafeForMutations(url);
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function cleanupFixture(supabase: Supabase, ids: FixtureIds): Promise<void> {
  await supabase.from("subcontract_payments").delete().eq("bill_id", ids.billId);
  await supabase.from("subcontract_bills").delete().eq("id", ids.billId);
  await supabase.from("subcontracts").delete().eq("id", ids.subcontractId);
  await supabase.from("subcontractors").delete().eq("id", ids.subcontractorId);
  await supabase.from("projects").delete().eq("id", ids.projectId);
}

type FixtureIds = {
  projectId: string;
  subcontractorId: string;
  subcontractId: string;
  billId: string;
};

async function createLegacyPendingBillFixture(
  supabase: Supabase,
  marker: string
): Promise<FixtureIds> {
  const ids = {
    projectId: randomUUID(),
    subcontractorId: randomUUID(),
    subcontractId: randomUUID(),
    billId: randomUUID(),
  };

  const { error: projectError } = await supabase.from("projects").insert({
    id: ids.projectId,
    name: `${marker} Project`,
    status: "Active",
    budget: 1000,
    contract_amount: 1000,
    spent: 0,
  });
  expect(projectError?.message ?? "").toBe("");

  const { error: subcontractorError } = await supabase.from("subcontractors").insert({
    id: ids.subcontractorId,
    name: `${marker} Legacy Sub`,
    active: true,
  });
  expect(subcontractorError?.message ?? "").toBe("");

  const { error: subcontractError } = await supabase.from("subcontracts").insert({
    id: ids.subcontractId,
    project_id: ids.projectId,
    subcontractor_id: ids.subcontractorId,
    contract_amount: 1000,
    status: "Draft",
    description: `${marker} legacy duplicate approve contract`,
  });
  expect(subcontractError?.message ?? "").toBe("");

  const { error: billError } = await supabase.from("subcontract_bills").insert({
    id: ids.billId,
    project_id: ids.projectId,
    subcontract_id: ids.subcontractId,
    bill_date: "2026-06-01",
    due_date: "2026-06-15",
    amount: 100,
    description: `${marker} legacy duplicate approve bill`,
    status: "Pending",
  });
  expect(billError?.message ?? "").toBe("");

  return ids;
}

async function expectNoServerError(page: Page): Promise<void> {
  const body = page.locator("body");
  await expect(body).not.toContainText(
    /Application error|Internal Server Error|Server Component error|Something went wrong/i
  );
  await expect(body).not.toContainText("Bill is already approved");
}

test.describe("legacy subcontract bill duplicate approval", () => {
  test.describe.configure({ timeout: 180_000 });

  test("keeps the subcontract bills route stable and cost counted once after duplicate approve", async ({
    page,
  }, testInfo) => {
    test.skip(!allowDeleteMutations(testInfo), "Local subcontract bill mutation target required.");
    const supabase = supabaseForLocalMutations();
    if (!supabase) {
      test.skip(true, "Local Supabase service role env is required for fixture setup.");
      return;
    }

    const marker = `TEST-LEGACY-SUB-APPROVE-${Date.now()}`;
    const ids = await createLegacyPendingBillFixture(supabase, marker);

    try {
      const route = `/projects/${ids.projectId}/subcontracts/${ids.subcontractId}/bills`;
      const response = await page.goto(`${BASE}${route}`, {
        waitUntil: "domcontentloaded",
        timeout: LOAD_MS,
      });
      expect(response?.status()).not.toBe(500);
      await expect(page.getByRole("heading", { name: "Subcontract Bills" })).toBeVisible({
        timeout: LOAD_MS,
      });
      await expectNoServerError(page);

      const billRow = page.locator("tr").filter({ hasText: marker }).first();
      await expect(billRow).toBeVisible({ timeout: LOAD_MS });
      await expect(billRow).toContainText("Pending");

      const approveButton = billRow.getByRole("button", { name: "Approve" });
      await expect(approveButton).toBeVisible();
      await approveButton.click();

      await expect(page.locator("body")).toContainText("Approved", { timeout: LOAD_MS });
      await expectNoServerError(page);
      await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);

      await expect
        .poll(async () => {
          const result = await approveSubcontractBill(ids.billId);
          return result.alreadyApproved;
        })
        .toBe(true);

      await page.goto(`${BASE}${route}`, {
        waitUntil: "domcontentloaded",
        timeout: LOAD_MS,
      });
      await expect(page.getByRole("heading", { name: "Subcontract Bills" })).toBeVisible({
        timeout: LOAD_MS,
      });
      await expectNoServerError(page);
      await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);

      await expect
        .poll(async () => {
          const { data } = await supabase
            .from("subcontract_bills")
            .select("status")
            .eq("id", ids.billId)
            .maybeSingle();
          return data?.status ?? null;
        })
        .toBe("Approved");

      await expect
        .poll(async () => {
          const { data } = await supabase
            .from("projects")
            .select("spent")
            .eq("id", ids.projectId)
            .maybeSingle();
          return num(data?.spent);
        })
        .toBe(100);

      const { count: billRecordCount, error: billRecordCountError } = await supabase
        .from("subcontract_bills")
        .select("id", { count: "exact", head: true })
        .eq("id", ids.billId);
      expect(billRecordCountError?.message ?? "").toBe("");
      expect(billRecordCount).toBe(1);

      const { count: approvalPaymentCount, error: approvalPaymentCountError } = await supabase
        .from("subcontract_payments")
        .select("id", { count: "exact", head: true })
        .eq("bill_id", ids.billId);
      expect(approvalPaymentCountError?.message ?? "").toBe("");
      expect(approvalPaymentCount).toBe(0);
    } finally {
      await cleanupFixture(supabase, ids);
    }
  });
});
