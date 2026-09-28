import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { loadE2EProcessEnv } from "./e2e-load-env";
loadE2EProcessEnv();
const ids = Object.fromEntries(
  [
    "project",
    "customer",
    "invoice",
    "payment",
    "allocation",
    "expense",
    "line",
    "bill",
    "billPayment",
    "inbox",
    "draft",
    "void",
    "legacy",
    "invalid",
  ].map((k) => [k, randomUUID()])
);
const marker = `PW Finance T5 ${ids.project.slice(0, 8)}`;
function sql(query: string) {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:54321")
    throw Error("Local-only T5 fixture");
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_hh-finance-audit-2026",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
    ],
    { input: query, encoding: "utf8" }
  );
}
function cleanup() {
  sql(`BEGIN;
    DELETE FROM deposits WHERE payment_id='${ids.payment}';
    DELETE FROM invoice_payments WHERE id='${ids.allocation}';
    DELETE FROM payments_received WHERE id='${ids.payment}' AND notes='${marker}';
    DELETE FROM invoice_items WHERE invoice_id='${ids.invoice}';
    DELETE FROM invoices WHERE id IN ('${ids.invoice}','${ids.draft}','${ids.void}','${ids.legacy}','${ids.invalid}') AND notes='${marker}';
    DELETE FROM ap_bill_payments WHERE id='${ids.billPayment}';
    DELETE FROM ap_bills WHERE id='${ids.bill}' AND notes='${marker}';
    DELETE FROM expense_lines WHERE expense_id IN ('${ids.expense}','${ids.inbox}');
    DELETE FROM expenses WHERE id IN ('${ids.expense}','${ids.inbox}') AND notes='${marker}';
    DELETE FROM projects WHERE id='${ids.project}' AND name='${marker}';
    DELETE FROM customers WHERE id='${ids.customer}' AND name='${marker}';
    COMMIT;`);
}
test.beforeAll(() => {
  sql(`BEGIN;
    INSERT INTO customers(id,name) VALUES('${ids.customer}','${marker}');
    INSERT INTO projects(id,name,budget,contract_amount,customer_id,status) VALUES('${ids.project}','${marker}',100,100,'${ids.customer}','Active');
    INSERT INTO invoices(id,invoice_no,project_id,customer_id,client_name,issue_date,due_date,status,subtotal,total,notes) VALUES('${ids.invoice}','${marker}','${ids.project}','${ids.customer}','${marker}','2026-09-01','2026-09-20','Sent',100,100,'${marker}');
    INSERT INTO payments_received(id,invoice_id,project_id,customer_id,customer_name,payment_date,amount,payment_method,deposit_account,notes,status) VALUES('${ids.payment}','${ids.invoice}','${ids.project}','${ids.customer}','${marker}','2026-09-02',40,'Cash','TEST Finance T5','${marker}','Recorded');
    INSERT INTO invoice_payments(id,invoice_id,payment_received_id,amount,paid_at,status) VALUES('${ids.allocation}','${ids.invoice}','${ids.payment}',40,'2026-09-02','Posted');
    INSERT INTO expenses(id,expense_date,project_id,vendor_name,amount,total,status,source_type,notes) VALUES('${ids.expense}','2026-09-03','${ids.project}','${marker}',30,30,'approved','company','${marker}'),('${ids.inbox}','2026-09-03','${ids.project}','${marker} Inbox',0,0,'pending','company','${marker}');
    INSERT INTO expense_lines(id,expense_id,project_id,amount) VALUES('${ids.line}','${ids.expense}','${ids.project}',30);
    INSERT INTO ap_bills(id,bill_no,bill_type,vendor_name,project_id,issue_date,due_date,amount,paid_amount,balance_amount,status,notes) VALUES('${ids.bill}','${marker}','Vendor','${marker}','${ids.project}','2026-09-04','2026-09-21',20,5,15,'Partially Paid','${marker}');
    INSERT INTO ap_bill_payments(id,bill_id,payment_date,amount,notes) VALUES('${ids.billPayment}','${ids.bill}','2026-09-05',5,'${marker}');
    INSERT INTO invoices(id,project_id,customer_id,issue_date,status,total,notes) VALUES ${["draft", "void", "legacy", "invalid"].map((k) => `('${ids[k]}','${ids.project}','${ids.customer}','2026-09-01','${k[0].toUpperCase() + k.slice(1)}',999,'${marker}')`).join(",")};
    COMMIT;`);
});
test.afterAll(() => {
  cleanup();
  expect(sql(`SELECT count(*) FROM projects WHERE id='${ids.project}';`).trim()).toBe("0");
});
const base = () =>
  `/reports?${new URLSearchParams({ period: "custom", from: "2026-09-01", to: "2026-09-30", projectId: ids.project, customerId: ids.customer, tab: "monthly", selectedRecord: "original", filter: "preserve" })}`;
async function evidence(page: Page, info: TestInfo, name: string) {
  const layout = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>("[data-app-scroll-root]");
    const text = document.querySelector<HTMLElement>('[data-testid="metric-records"]');
    return {
      viewport: innerWidth,
      document: document.documentElement.scrollWidth,
      rootWidth: root?.clientWidth,
      rootScroll: root?.scrollWidth,
      shells: document.querySelectorAll("[data-app-scroll-root]").length,
      sidebars: document.querySelectorAll("[data-app-sidebar]").length,
      foreground: text ? getComputedStyle(text).color : null,
    };
  });
  await info.attach(name, { body: JSON.stringify(layout), contentType: "application/json" });
  await page.screenshot({ path: info.outputPath(`${name}.png`) });
  expect(layout.document).toBeLessThanOrEqual(layout.viewport);
  if (layout.rootWidth) expect(layout.rootScroll).toBeLessThanOrEqual(layout.rootWidth);
}
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
])
  test(`T5 exact KPI records and Back ${viewport.width}`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.goto(base());
    const expected: Record<string, string> = {
      "Invoiced Revenue": "$100.00",
      "Collected Cash": "$40.00",
      Expenses: "$30.00",
      "Outstanding AP · current": "$15.00",
      "Outstanding AR · current": "$60.00",
      "Inbox Missing Receipts": "1",
      "Reviewed Project Profit · lifetime": "$70.00",
    };
    for (const [name, value] of Object.entries(expected))
      await expect(
        page.getByRole("button", { name: `View ${name} records`, exact: true })
      ).toContainText(value);
    await page.getByRole("button", { name: "View Invoiced Revenue records", exact: true }).click();
    const origin = page.url();
    await expect(page.getByTestId("metric-records").getByRole("link")).toHaveCount(1);
    await page.getByTestId("metric-records").getByRole("link").click();
    await expect(page.getByRole("link", { name: "Back to report", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Back to report", exact: true }).click();
    await expect(page).toHaveURL(origin);
    await page
      .getByRole("button", { name: "View Outstanding AP · current records", exact: true })
      .click();
    const billOrigin = page.url();
    await page.getByTestId("metric-records").getByRole("link").click();
    const billSheet = page.getByRole("dialog");
    await expect(billSheet.getByText("Vendor / payee", { exact: true })).toBeVisible();
    await expect(billSheet).toContainText("$15.00");
    await billSheet.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page).toHaveURL(billOrigin);
    await page.getByRole("button", { name: "View Expenses records", exact: true }).click();
    const expenseOrigin = page.url();
    await page.getByTestId("metric-records").getByRole("link").click();
    await page.getByRole("link", { name: "Back to report", exact: true }).click();
    await expect(page).toHaveURL(expenseOrigin);
    await evidence(page, info, `report-records-${viewport.width}`);
    expect(errors).toEqual([]);
  });
test("T5 aging, project, overview and cash drilldown", async ({ page }, info) => {
  await page.goto(base());
  await page.getByRole("button", { name: "View Collected Cash records", exact: true }).click();
  const paymentOrigin = page.url();
  await page.getByTestId("metric-records").getByRole("link").click();
  await expect(page).toHaveURL(new RegExp(ids.payment));
  await expect(page.getByRole("dialog")).toContainText("$40.00");
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("link", { name: "Back to report", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Back to report", exact: true }).click();
  await expect(page).toHaveURL(paymentOrigin);
  await page.getByRole("tab", { name: "AR Aging", exact: true }).click();
  await page
    .getByTestId("ar-aging-content")
    .getByRole("button", { name: /Current/ })
    .click();
  const agingOrigin = page.url();
  await page
    .getByTestId("ar-aging-content")
    .locator('a[href^="/financial/invoices/"]')
    .filter({ visible: true })
    .click();
  await page.getByRole("link", { name: "Back to report", exact: true }).click();
  await expect(page).toHaveURL(agingOrigin);
  await page.getByRole("tab", { name: "Project Profitability", exact: true }).click();
  const projectOrigin = page.url();
  await page.getByRole("link", { name: marker, exact: true }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/tab=financial/);
  await page.getByRole("link", { name: "Back to report", exact: true }).click();
  await expect(page).toHaveURL(projectOrigin);
  await page.goto(
    `/finance?period=custom&from=2026-09-01&to=2026-09-30&projectId=${ids.project}&customerId=${ids.customer}`
  );
  await expect(page.getByRole("link").filter({ hasText: "Invoiced Revenue" })).toContainText(
    "$100.00"
  );
  await page.getByRole("link").filter({ hasText: "Invoiced Revenue" }).click();
  await expect(page.getByTestId("metric-records")).toContainText(marker);
  await evidence(page, info, "overview-report-scope");
});
test("T5 Inbox, AP aging, Owner consistency and Cashflow scope", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(base());
  await page
    .getByRole("button", { name: "View Inbox Missing Receipts records", exact: true })
    .click();
  const receiptOrigin = page.url();
  await page.getByTestId("metric-records").getByRole("link").click();
  await expect(page.getByRole("textbox", { name: "Vendor", exact: true })).toHaveValue(
    `${marker} Inbox`
  );
  await page.getByRole("button", { name: "Close receipt detail", exact: true }).click();
  await page.getByRole("link", { name: "Back to report", exact: true }).click();
  await expect(page).toHaveURL(receiptOrigin);
  await page.getByRole("tab", { name: "AP Aging", exact: true }).click();
  const apOrigin = page.url();
  await page
    .getByTestId("ap-aging-content")
    .getByRole("link", { name: marker, exact: true })
    .filter({ visible: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("$15.00");
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  await expect(page).toHaveURL(apOrigin);
  await page.goto(
    `/dashboard/cashflow?period=custom&from=2026-09-01&to=2026-09-30&projectId=${ids.project}&filter=preserve`
  );
  await expect(page.getByRole("status")).toContainText("full Net Cash Flow are unavailable");
  await page.getByRole("link", { name: "$40.00", exact: true }).click();
  await expect(page.getByTestId("metric-records")).toContainText("$40.00");
  await page.getByRole("link", { name: "Back to source", exact: true }).click();
  await expect(page).toHaveURL(/filter=preserve/);
  await page.getByRole("link", { name: "$15.00", exact: true }).click();
  await expect(page.getByTestId("metric-records")).toContainText("$15.00");
  await expect(page.getByTestId("metric-records").getByRole("link")).toHaveCount(1);
  await page.waitForLoadState("networkidle");
  await page.goto("/reports?period=this-month");
  const values: Record<string, string> = {};
  for (const label of ["Invoiced Revenue", "Collected Cash", "Expenses", "Labor Cost"]) {
    const text = await page
      .getByRole("button", { name: `View ${label} records`, exact: true })
      .innerText();
    values[label] = text.match(/\$[\d,.]+/)![0];
  }
  await page.waitForLoadState("networkidle");
  await page.goto("/financial/owner?filter=preserve");
  for (const [label, value] of Object.entries(values))
    await expect(page.locator(".kpi-metric").filter({ hasText: label }).first()).toContainText(
      value
    );
  await page
    .locator(".kpi-metric")
    .filter({ hasText: "Invoiced Revenue" })
    .getByRole("link", { name: "View records", exact: true })
    .click();
  await page.getByRole("link", { name: "Back to Owner", exact: true }).click();
  await expect(page).toHaveURL("http://localhost:3000/financial/owner?filter=preserve");
  await evidence(page, info, "owner-report-consistency");
  expect(errors).toEqual([]);
});

test("T5 scoped AP summary and Portfolio replacement", async ({ page }) => {
  await page.goto(
    `/financial/payables?projectId=${ids.project}&customerId=${ids.customer}&filter=preserve`
  );
  const summary = page.getByRole("region", { name: "AP summary" });
  await expect(summary.getByRole("link").filter({ hasText: "Outstanding" })).toContainText(
    "$15.00"
  );
  await expect(summary.getByRole("link").filter({ hasText: "Paid this month" })).toContainText(
    "$5.00"
  );
  await summary.getByRole("link").filter({ hasText: "Paid this month" }).click();
  await expect(page.getByTestId("metric-records")).toContainText("$5.00");
  await expect(page.getByTestId("metric-records").getByRole("link")).toHaveCount(1);
  await page.goto("/financial/dashboard");
  await expect(page.getByText(/READY TO DEPRECATE/)).toBeVisible();
  await page.getByRole("link").filter({ hasText: "Project Base Contract" }).click();
  await expect(page.getByTestId("metric-records")).toContainText(marker);
});

test("T5 AR summary uses exact scoped invoice and allocation records", async ({ page }) => {
  await page.goto(
    `/financial/ar?projectId=${ids.project}&customerId=${ids.customer}&filter=preserve`
  );
  const summary = page.getByTestId("ar-workspace-summary");
  await expect(summary.getByRole("link").filter({ hasText: "Outstanding" })).toContainText(
    "$60.00"
  );
  await expect(summary.getByRole("link").filter({ hasText: "Collected Cash" })).toContainText(
    "$40.00"
  );
  await summary.getByRole("link").filter({ hasText: "Outstanding" }).click();
  await expect(page.getByTestId("metric-records")).toContainText("$60.00");
  await expect(page.getByTestId("metric-records").getByRole("link")).toHaveCount(1);
});
