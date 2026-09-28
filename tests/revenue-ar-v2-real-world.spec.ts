import { expect, test, type Locator, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { gotoWithE2EAuth, loginAsE2EOwner } from "./e2e-auth-owner";
import {
  assertE2EBaseUrlSafeForMutations,
  assertE2ESupabaseUrlSafeForMutations,
} from "./e2e-supabase-url-guard";

const TOTAL = 987654.32;
const FIRST_PAYMENT = 123456.78;
const SECOND_PAYMENT = 864197.54;
const TOTAL_CENTS = 98765432;
const FIRST_PAYMENT_CENTS = 12345678;
const SECOND_PAYMENT_CENTS = 86419754;
const fixture = {
  invoiceIds: [] as string[],
  paymentIds: [] as string[],
  projectId: "",
  customerId: "",
};

function toCents(value: unknown): number {
  return Math.round(Number(value) * 100);
}

function db(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  assertE2ESupabaseUrlSafeForMutations(url);
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function cleanup(supabase: SupabaseClient) {
  if (fixture.paymentIds.length) {
    await supabase
      .from("payment_received_attachments")
      .delete()
      .in("payment_id", fixture.paymentIds);
  }
  if (fixture.invoiceIds.length) {
    await supabase.from("deposits").delete().in("invoice_id", fixture.invoiceIds);
    await supabase.from("payments_received").delete().in("invoice_id", fixture.invoiceIds);
    await supabase.from("invoice_payments").delete().in("invoice_id", fixture.invoiceIds);
    await supabase.from("invoice_items").delete().in("invoice_id", fixture.invoiceIds);
    await supabase.from("invoices").delete().in("id", fixture.invoiceIds);
  }
  if (fixture.projectId) await supabase.from("projects").delete().eq("id", fixture.projectId);
  if (fixture.customerId) await supabase.from("customers").delete().eq("id", fixture.customerId);
}

async function seed(supabase: SupabaseClient) {
  fixture.invoiceIds.length = 0;
  fixture.paymentIds.length = 0;
  fixture.projectId = "";
  fixture.customerId = "";
  const marker = `PW Revenue AR V2 ${Date.now()}`;
  const customerName = `${marker} Customer with a deliberately long accounts payable name`;
  const projectName = `${marker} Project with an intentionally long commercial renovation description`;
  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .insert({ name: customerName, status: "active" })
    .select("id")
    .single();
  expect(customerError).toBeNull();
  fixture.customerId = String(customer?.id ?? "");
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({ name: projectName, status: "active", budget: 0, spent: 0 })
    .select("id")
    .single();
  expect(projectError).toBeNull();
  fixture.projectId = String(project?.id ?? "");

  const rows = [
    ["OVERDUE", "Sent", "2025-01-01", 250],
    ["PARTIAL", "Partially Paid", "2027-01-01", TOTAL],
    ["PAID", "Sent", "2026-01-01", 50],
    ["VOID", "Void", "2026-01-01", 75],
    ["DRAFT", "Draft", "2027-06-01", 1250],
  ] as const;
  for (const [label, status, dueDate, total] of rows) {
    const { data, error } = await supabase
      .from("invoices")
      .insert({
        invoice_no: `${marker}-${label}`,
        project_id: fixture.projectId,
        customer_id: fixture.customerId,
        client_name: customerName,
        issue_date: "2025-12-01",
        due_date: dueDate,
        status,
        subtotal: total,
        tax_amount: 0,
        total,
        paid_total: 0,
        balance_due: label === "VOID" ? 0 : total,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    fixture.invoiceIds.push(String(data?.id ?? ""));
  }
  const partialId = fixture.invoiceIds[1];
  const paidId = fixture.invoiceIds[2];
  const { data: firstReceipt, error: firstReceiptError } = await supabase
    .from("payments_received")
    .insert({
      invoice_id: partialId,
      project_id: fixture.projectId,
      customer_name: customerName,
      payment_date: "2025-12-15",
      amount: FIRST_PAYMENT,
      payment_method: "Check",
      deposit_account: "Operating",
      notes: "PW Revenue AR V2 first linked payment",
      status: "completed",
    })
    .select("id")
    .single();
  expect(firstReceiptError).toBeNull();
  const firstReceiptId = String(firstReceipt?.id ?? "");
  fixture.paymentIds.push(firstReceiptId);
  const { error: attachmentError } = await supabase.from("payment_received_attachments").insert({
    payment_id: firstReceiptId,
    file_url: "https://example.invalid/revenue-ar-v2-payment-proof.pdf",
    file_name: "revenue-ar-v2-payment-proof.pdf",
    file_type: "pdf",
    mime_type: "application/pdf",
    size_bytes: 2048,
  });
  expect(attachmentError).toBeNull();
  const { data: allocation, error: allocationError } = await supabase
    .from("invoice_payments")
    .insert({
      invoice_id: partialId,
      paid_at: "2025-12-15",
      amount: FIRST_PAYMENT,
      method: "Check",
      status: "Posted",
      payment_received_id: firstReceiptId,
    })
    .select("id")
    .single();
  expect(allocationError).toBeNull();
  const firstDeposit = {
    payment_id: firstReceiptId,
    invoice_id: partialId,
    project_id: fixture.projectId,
    customer_name: customerName,
    deposit_account: "Operating",
    amount: FIRST_PAYMENT,
    payment_method: "Check",
    deposit_date: "2025-12-15",
    status: "posted",
  };
  const { data: existingDeposits, error: existingDepositError } = await supabase
    .from("deposits")
    .select("id")
    .eq("payment_id", firstReceiptId)
    .limit(1);
  expect(existingDepositError).toBeNull();
  const { error: firstDepositError } = existingDeposits?.[0]?.id
    ? await supabase.from("deposits").update(firstDeposit).eq("id", existingDeposits[0].id)
    : await supabase.from("deposits").insert(firstDeposit);
  expect(firstDepositError).toBeNull();
  const { error: paidAllocationError } = await supabase.from("invoice_payments").insert({
    invoice_id: paidId,
    paid_at: "2025-12-16",
    amount: 50,
    method: "Check",
    status: "Posted",
  });
  expect(paidAllocationError).toBeNull();
  return {
    customerName,
    projectName,
    partialId,
    draftId: fixture.invoiceIds[4],
    firstReceiptId,
    allocationId: String(allocation?.id ?? ""),
  };
}

async function assertViewport(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  const metrics = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(metrics.document).toBeLessThanOrEqual(metrics.viewport + 1);
}

async function assertVisibleTouchTarget(target: Locator, label: string) {
  await expect(target, `${label} is visible`).toBeVisible();
  const box = await target.boundingBox();
  expect(box, `${label} has a measurable touch target`).not.toBeNull();
  expect(
    Math.min(box!.width, box!.height),
    `${label} retains a 44px target`
  ).toBeGreaterThanOrEqual(44);
}

async function dismissSystemIssueNotification(page: Page) {
  const dismiss = page.getByRole("button", { name: "Dismiss information notification" });
  if (await dismiss.isVisible()) await dismiss.click();
}

test.afterEach(async () => {
  const supabase = db();
  if (supabase) await cleanup(supabase);
});

test("Revenue & AR V2 dense local workflow preserves literal ledger values across routes", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(180_000);
  assertE2EBaseUrlSafeForMutations(baseURL, "Revenue & AR V2 local fixture");
  const supabase = db();
  test.skip(!supabase, "Local Supabase service-role environment is required.");
  if (!supabase) return;
  const errors: string[] = [];
  page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
  page.on("pageerror", (error) => errors.push(error.message));
  const state = await seed(supabase);
  await loginAsE2EOwner(page, "/financial/ar");

  for (const [route, viewports] of [
    [
      "/financial/ar",
      [
        [1440, 900],
        [1280, 800],
        [1180, 820],
        [820, 1180],
        [390, 844],
      ],
    ],
    [
      "/financial/invoices",
      [
        [1440, 900],
        [1280, 800],
        [1180, 820],
        [820, 1180],
        [390, 844],
      ],
    ],
    [
      `/financial/invoices/${state.partialId}`,
      [
        [1440, 900],
        [1280, 800],
        [1180, 820],
        [820, 1180],
        [390, 844],
      ],
    ],
    [
      "/financial/payments",
      [
        [1440, 900],
        [1280, 800],
        [1180, 820],
        [820, 1180],
        [390, 844],
      ],
    ],
    [
      "/financial/deposits",
      [
        [1440, 900],
        [1280, 800],
        [1180, 820],
        [820, 1180],
        [390, 844],
      ],
    ],
  ] as const) {
    for (const [width, height] of viewports) {
      await page.setViewportSize({ width, height });
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");
      await dismissSystemIssueNotification(page);
      await assertViewport(page, width, height);
      if (route === "/financial/invoices") {
        await expect(page.locator("[data-agent-a-dense-queue]")).toHaveCount(0);
      }
      if (width === 820 || width === 390) {
        if (route === "/financial/ar") {
          await assertVisibleTouchTarget(
            page.locator('a[href*="recordPayment=1"]:visible').first(),
            "AR receive payment"
          );
          await assertVisibleTouchTarget(
            page.locator('a[href*="?invoice="]:visible').first(),
            "AR invoice context"
          );
        } else if (route === "/financial/invoices") {
          await assertVisibleTouchTarget(
            page.getByRole("button", { name: "Filters" }).first(),
            "Invoice filters"
          );
          await assertVisibleTouchTarget(
            page.getByRole("link", { name: /New Invoice/i }).first(),
            "New invoice"
          );
        } else if (route === `/financial/invoices/${state.partialId}`) {
          await assertVisibleTouchTarget(
            page.locator('[data-testid="invoice-payment-attachment-action"]:visible').first(),
            "Invoice payment attachment"
          );
          await assertVisibleTouchTarget(
            page.getByRole("link", { name: "Receive Payment" }).first(),
            "Invoice receive payment"
          );
        } else if (route === "/financial/payments") {
          await assertVisibleTouchTarget(
            page.locator('[data-testid="payment-attachment-action"]:visible').first(),
            "Payment attachment"
          );
          await assertVisibleTouchTarget(
            page.getByRole("button", { name: "Receive Payment" }).first(),
            "Payments receive payment"
          );
        } else if (route === "/financial/deposits") {
          await assertVisibleTouchTarget(
            width === 390
              ? page.getByRole("button", { name: "Filters" }).first()
              : page.getByRole("button", { name: "Refresh" }).first(),
            width === 390 ? "Deposit filters" : "Deposit refresh"
          );
        }
      }
      await page.screenshot({
        path: `test-results/revenue-ar-v2/${route.replaceAll("/", "-")}-${width}x${height}.png`,
        fullPage: true,
      });
    }
  }

  await gotoWithE2EAuth(page, "/financial/invoices");
  await page.getByRole("button", { name: "Filters" }).first().click();
  await expect(page.getByLabel("Status")).toBeVisible();
  await expect(page.getByLabel("Project")).toBeVisible();
  await expect(page.getByLabel("Issue from")).toBeVisible();
  await expect(page.getByLabel("Issue to")).toBeVisible();

  await gotoWithE2EAuth(page, `/financial/invoices/${state.draftId}`);
  await page.getByRole("button", { name: "Edit Draft" }).click();
  await expect(page.getByLabel("Client name")).toBeVisible();
  await expect(page.getByLabel("Issue date")).toBeVisible();
  await expect(page.getByLabel("Due date")).toBeVisible();
  await expect(page.getByLabel("Tax %")).toBeVisible();
  await expect(page.getByLabel("Notes")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  await gotoWithE2EAuth(page, `/financial/payments?sendReceipt=${state.firstReceiptId}`);
  const sendReceiptDialog = page.getByRole("dialog", { name: "Send payment receipt" });
  await expect(sendReceiptDialog.getByLabel("To")).toBeVisible();
  await expect(sendReceiptDialog.getByLabel("Subject")).toBeVisible();
  await expect(sendReceiptDialog.getByLabel("Message")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sendReceiptDialog).toBeHidden();
  await page.waitForURL(/\/financial\/payments$/);
  await page.waitForLoadState("networkidle");

  await gotoWithE2EAuth(page, `/financial/invoices/${state.partialId}`);
  await expect(page.getByTestId("invoice-detail-balance")).toContainText("$864,197.54");
  await page.getByRole("link", { name: "Receive Payment" }).click();
  const dialog = page.getByRole("dialog", { name: "Receive Payment" });
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder("0").fill(String(SECOND_PAYMENT));
  await dialog.locator("select").nth(1).selectOption("Check");
  await dialog.getByRole("button", { name: "Receive Payment" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });

  const { data: receipt, error: receiptError } = await supabase
    .from("payments_received")
    .select("id,amount,status")
    .eq("invoice_id", state.partialId)
    .neq("id", state.firstReceiptId)
    .single();
  expect(receiptError).toBeNull();
  expect(toCents(receipt?.amount)).toBe(SECOND_PAYMENT_CENTS);
  fixture.paymentIds.push(String(receipt?.id ?? ""));
  const { data: invoice } = await supabase
    .from("invoices")
    .select("status,total")
    .eq("id", state.partialId)
    .single();
  expect(invoice).toMatchObject({ status: "Paid" });
  expect(toCents(invoice?.total)).toBe(TOTAL_CENTS);
  const { data: allocations } = await supabase
    .from("invoice_payments")
    .select("id,amount,status,payment_received_id")
    .eq("invoice_id", state.partialId);
  const postedAllocations = (allocations ?? []).filter((row) => row.status === "Posted");
  expect(postedAllocations).toHaveLength(2);
  expect(
    postedAllocations.some(
      (row) => row.id === state.allocationId && toCents(row.amount) === FIRST_PAYMENT_CENTS
    )
  ).toBe(true);
  const postedTotalCents = postedAllocations.reduce((sum, row) => sum + toCents(row.amount), 0);
  expect(postedTotalCents).toBe(TOTAL_CENTS);
  expect(
    postedAllocations.some(
      (row) =>
        row.payment_received_id === receipt?.id && toCents(row.amount) === SECOND_PAYMENT_CENTS
    )
  ).toBe(true);
  const { data: deposit } = await supabase
    .from("deposits")
    .select("amount,payment_id,invoice_id")
    .eq("invoice_id", state.partialId)
    .eq("payment_id", receipt?.id)
    .single();
  expect(toCents(deposit?.amount)).toBe(SECOND_PAYMENT_CENTS);
  expect(deposit?.invoice_id).toBe(state.partialId);
  await gotoWithE2EAuth(page, "/financial/deposits");
  const visibleDepositSearch = page.locator('input[aria-label="Search deposits"]:visible');
  await expect(visibleDepositSearch).toHaveCount(1);
  await visibleDepositSearch.fill(state.customerName);
  await expect(page.getByText("$864,197.54").first()).toBeVisible();
  await expect(page.getByText(state.customerName).first()).toBeVisible();
  await gotoWithE2EAuth(page, `/financial/invoices/${state.partialId}`);
  await page.reload();
  await expect(page.getByTestId("invoice-detail-status")).toContainText("Paid");
  await expect(page.getByTestId("invoice-detail-balance")).toContainText("$0.00");
  await gotoWithE2EAuth(page, `/financial/payments?receipt=${receipt?.id}`);
  await expect(page.getByText("$864,197.54").first()).toBeVisible();
  await expect(page.getByText(state.customerName).first()).toBeVisible();
  await gotoWithE2EAuth(page, `/financial/invoices/${state.partialId}/preview`);
  await expect(page.getByTestId("invoice-preview-total")).toContainText("$987,654.32");
  await expect(page.getByTestId("invoice-preview-balance")).toContainText("$0.00");
  await page.reload();
  expect(errors).toEqual([]);
});
