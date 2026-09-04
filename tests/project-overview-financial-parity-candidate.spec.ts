import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { E2E_PRESERVED_CUSTOMER_ID, E2E_PRESERVED_PROJECT_ID } from "./e2e-cleanup-db";
import { loginAsE2EOwner } from "./e2e-auth-owner";
import {
  assertE2EBaseUrlSafeForMutations,
  assertE2ESupabaseUrlSafeForMutations,
} from "./e2e-supabase-url-guard";

type Snapshot = {
  contractValue: number;
  actualCost: number;
  expenseCost: number;
  laborCost: number;
  reimbursementCost: number;
  subcontractCost: number;
  commissionCost: number;
  billedAmount: number;
  paidAmount: number;
  openAR: number;
  grossProfit: number;
  grossMargin: number;
};

function wholeDollar(value: number): string {
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function exactDollar(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function localDatabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  assertE2ESupabaseUrlSafeForMutations(url);
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function deleteDraftPaymentFixture(
  supabase: SupabaseClient,
  fixture: { invoiceId: string; projectId: string }
) {
  await supabase.from("invoice_payments").delete().eq("invoice_id", fixture.invoiceId);
  await supabase.from("invoice_items").delete().eq("invoice_id", fixture.invoiceId);
  await supabase.from("invoices").delete().eq("id", fixture.invoiceId);
  await supabase.from("projects").delete().eq("id", fixture.projectId);
}

async function createDraftPaymentFixture(supabase: SupabaseClient) {
  const marker = `PW Project snapshot authority ${Date.now()}`;
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      name: marker,
      status: "active",
      budget: 1000,
      spent: 0,
      client: "[E2E] Snapshot authority client",
      customer_id: E2E_PRESERVED_CUSTOMER_ID,
    })
    .select("id")
    .single();
  expect(projectError).toBeNull();
  const projectId = String(project?.id ?? "");

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .insert({
      invoice_no: `${marker}-DRAFT`,
      project_id: projectId,
      customer_id: E2E_PRESERVED_CUSTOMER_ID,
      client_name: "[E2E] Snapshot authority client",
      issue_date: "2026-01-01",
      due_date: "2027-01-01",
      status: "Draft",
      subtotal: 900,
      tax_amount: 0,
      total: 900,
      paid_total: 0,
      balance_due: 900,
    })
    .select("id")
    .single();
  expect(invoiceError).toBeNull();
  const invoiceId = String(invoice?.id ?? "");

  const legacyOnlyPayment = 321.45;
  const { error: paymentError } = await supabase.from("invoice_payments").insert({
    invoice_id: invoiceId,
    paid_at: "2026-01-02",
    amount: legacyOnlyPayment,
    method: "Check",
    status: "Posted",
  });
  expect(paymentError).toBeNull();

  return { invoiceId, legacyOnlyPayment, projectId };
}

test.describe("Project Overview authoritative financial snapshot", () => {
  test("renders Overview totals and reimbursement classification from the snapshot response", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const snapshotPath = `/api/projects/${E2E_PRESERVED_PROJECT_ID}/financial-snapshot`;
    const projectPath = `/projects/${E2E_PRESERVED_PROJECT_ID}`;
    const documentResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().resourceType() === "document" && url.pathname === projectPath;
    });
    const responsePromise = page.waitForResponse(
      (response) => response.url().includes(snapshotPath) && response.request().method() === "GET"
    );
    await loginAsE2EOwner(page, `/projects/${E2E_PRESERVED_PROJECT_ID}?tab=overview`);
    const documentResponse = await documentResponsePromise;
    expect(documentResponse.status()).toBe(200);
    const response = await responsePromise;
    expect(response.status(), await response.text()).toBe(200);
    const payload = (await response.json()) as {
      ok: boolean;
      comparison: { newSnapshot: Snapshot };
    };
    expect(payload.ok).toBe(true);
    const snapshot = payload.comparison.newSnapshot;

    await expect(page.getByRole("tab", { name: "Overview", exact: true })).toHaveAttribute(
      "data-state",
      "active"
    );
    await expect(page.getByTestId("project-header-contract-value")).toHaveText(
      wholeDollar(snapshot.contractValue)
    );
    await expect(page.getByTestId("project-header-actual-cost")).toHaveText(
      wholeDollar(snapshot.actualCost)
    );
    await expect(page.getByTestId("project-header-collected")).toHaveText(
      wholeDollar(snapshot.paidAmount)
    );
    await expect(page.getByTestId("project-header-need-collect")).toHaveText(
      wholeDollar(snapshot.openAR)
    );
    await expect(page.getByTestId("project-header-profit")).toHaveText(
      `${snapshot.grossProfit < 0 ? "-" : ""}${wholeDollar(Math.abs(snapshot.grossProfit))}`
    );
    await expect(page.getByTestId("project-header-margin")).toHaveText(
      `${(snapshot.grossMargin * 100).toFixed(1)}%`
    );

    const summary = page.locator("section").filter({ hasText: "Financial Summary" }).first();
    await expect(summary.getByText("Collected", { exact: true }).locator("..")).toContainText(
      wholeDollar(snapshot.paidAmount)
    );
    await expect(summary.getByText("Billed", { exact: true }).locator("..")).toContainText(
      exactDollar(snapshot.billedAmount)
    );
    await expect(summary.getByText("Paid", { exact: true }).locator("..")).toContainText(
      exactDollar(snapshot.paidAmount)
    );
    await expect(summary.getByText("Need collect", { exact: true }).locator("..")).toContainText(
      wholeDollar(snapshot.openAR)
    );

    const costs = page.locator("section").filter({ hasText: "Cost Breakdown" }).first();
    for (const [label, value] of [
      ["Actual cost", snapshot.actualCost],
      ["Expenses", snapshot.expenseCost],
      ["Labor", snapshot.laborCost],
      ["Reimbursements", snapshot.reimbursementCost],
      ["Subcontracts", snapshot.subcontractCost],
      ["Commission", snapshot.commissionCost],
    ] as const) {
      await expect(costs.getByText(label, { exact: true }).locator("..")).toContainText(
        wholeDollar(value)
      );
    }
  });

  test("uses the authoritative snapshot when a Draft invoice payment makes legacy billing diverge", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(180_000);
    assertE2EBaseUrlSafeForMutations(baseURL, "Project snapshot authority fixture");
    const supabase = localDatabase();
    test.skip(!supabase, "Local Supabase service-role environment is required.");
    if (!supabase) return;

    const errors: string[] = [];
    page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
    page.on("pageerror", (error) => errors.push(error.message));
    const fixture = await createDraftPaymentFixture(supabase);

    try {
      const snapshotPath = `/api/projects/${fixture.projectId}/financial-snapshot`;
      const responsePromise = page.waitForResponse(
        (response) => response.url().includes(snapshotPath) && response.request().method() === "GET"
      );
      await loginAsE2EOwner(page, `/projects/${fixture.projectId}?tab=overview`);
      const response = await responsePromise;
      expect(response.status(), await response.text()).toBe(200);
      const payload = (await response.json()) as {
        ok: boolean;
        comparison: { newSnapshot: Snapshot };
      };
      expect(payload.ok).toBe(true);
      const snapshot = payload.comparison.newSnapshot;

      expect(snapshot.billedAmount).toBe(0);
      expect(snapshot.paidAmount).toBe(0);
      expect(snapshot.openAR).toBe(0);

      await expect(page.getByTestId("project-header-collected")).toHaveText(
        wholeDollar(snapshot.paidAmount)
      );
      await expect(page.getByTestId("project-header-need-collect")).toHaveText(
        wholeDollar(snapshot.openAR)
      );
      await expect(page.getByTestId("project-header-actual-cost")).toHaveText(
        wholeDollar(snapshot.actualCost)
      );
      await expect(page.getByTestId("project-header-profit")).toHaveText(
        `${snapshot.grossProfit < 0 ? "-" : ""}${wholeDollar(Math.abs(snapshot.grossProfit))}`
      );
      await expect(page.getByTestId("project-header-margin")).toHaveText(
        `${(snapshot.grossMargin * 100).toFixed(1)}%`
      );

      const summary = page.locator("section").filter({ hasText: "Financial Summary" }).first();
      await expect(summary.getByText("Collected", { exact: true }).locator("..")).toContainText(
        wholeDollar(snapshot.paidAmount)
      );
      await expect(summary.getByText("Billed", { exact: true }).locator("..")).toContainText(
        exactDollar(snapshot.billedAmount)
      );
      await expect(summary.getByText("Paid", { exact: true }).locator("..")).toContainText(
        exactDollar(snapshot.paidAmount)
      );
      await expect(summary.getByText("Need collect", { exact: true }).locator("..")).toContainText(
        wholeDollar(snapshot.openAR)
      );
      await expect(page.getByTestId("project-header-collected")).not.toContainText(
        wholeDollar(fixture.legacyOnlyPayment)
      );
      await expect(summary.getByText("Collected", { exact: true }).locator("..")).not.toContainText(
        wholeDollar(fixture.legacyOnlyPayment)
      );
      expect(errors).toEqual([]);
    } finally {
      await deleteDraftPaymentFixture(supabase, fixture);
    }
  });

  test("fails closed when the authoritative snapshot is unavailable", async ({ page }) => {
    test.setTimeout(180_000);
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on(
      "console",
      (message) => message.type() === "error" && consoleErrors.push(message.text())
    );
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const snapshotPath = `/api/projects/${E2E_PRESERVED_PROJECT_ID}/financial-snapshot`;
    await page.route(`**${snapshotPath}**`, async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, message: "unavailable" }),
      });
    });

    await loginAsE2EOwner(page, `/projects/${E2E_PRESERVED_PROJECT_ID}?tab=overview`);
    await expect(page.getByTestId("project-header-financial-warning")).toContainText(
      "Project financial data is unavailable"
    );
    await expect(page.getByTestId("project-header-contract-value")).toHaveText("—");
    await expect(page.getByTestId("project-header-actual-cost")).toHaveText("—");
    await expect(page.getByTestId("project-header-collected")).toHaveText("—");
    await expect(page.getByTestId("project-header-need-collect")).toHaveText("—");
    await expect(page.getByTestId("project-header-profit")).toHaveText("Unavailable");
    await expect(page.getByTestId("project-header-margin")).toHaveText("—");

    const summary = page.locator("section").filter({ hasText: "Financial Summary" }).first();
    for (const label of [
      "Contract value",
      "Collected",
      "Need collect",
      "Billed",
      "Paid",
    ] as const) {
      await expect(summary.getByText(label, { exact: true }).locator("..")).toContainText("—");
    }
    await expect(summary).not.toContainText("$0");

    const costs = page.locator("section").filter({ hasText: "Cost Breakdown" }).first();
    for (const label of [
      "Actual cost",
      "Expenses",
      "Labor",
      "Reimbursements",
      "Subcontracts",
      "Commission",
    ] as const) {
      await expect(costs.getByText(label, { exact: true }).locator("..")).toContainText("—");
    }
    await expect(costs).not.toContainText("$0");
    await expect(page.getByText("Using legacy financial summary.")).toHaveCount(0);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([
      "Failed to load resource: the server responded with a status of 503 (Service Unavailable)",
    ]);
  });
});
