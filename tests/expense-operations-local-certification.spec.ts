import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { loginAsE2EOwner, gotoWithE2EAuth } from "./e2e-auth-owner";

test.use({ actionTimeout: 15000 });
const browserDiagnostics = new WeakMap<Page, { errors: string[]; console: string[] }>();
test.beforeEach(async ({ page }) => {
  const diagnostics = { errors: [] as string[], console: [] as string[] };
  browserDiagnostics.set(page, diagnostics);
  page.on("pageerror", (error) => diagnostics.errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") diagnostics.console.push(message.text());
  });
});
test.afterEach(async ({ page }, info) => {
  const diagnostics = browserDiagnostics.get(page)!;
  await info.attach("browser-diagnostics", {
    body: JSON.stringify(diagnostics),
    contentType: "application/json",
  });
  expect(diagnostics.errors).toEqual([]);
});

const project = "11111111-1111-1111-1111-111111111111";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64"
);
function localDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  expect(["localhost", "127.0.0.1"]).toContain(new URL(url).hostname);
  return createClient(
    url,
    (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
async function cost(page: Page) {
  const response = await page.request.get(`/api/projects/${project}/tab?key=financial`);
  expect(response.ok(), await response.text()).toBe(true);
  const body = await response.json();
  expect(Number.isFinite(body.canonical?.expenseCost)).toBe(true);
  return body.canonical.expenseCost as number;
}

test("Worker application lifecycle retains canonical identity and cost through repayment", async ({
  page,
}, info) => {
  test.setTimeout(180000);
  const db = localDb();
  const worker = randomUUID();
  const vendor = `PW CERT ${worker.slice(0, 8)}`;
  const created = await db.from("workers").insert({ id: worker, name: vendor, status: "active" });
  expect(created.error).toBeNull();
  // The financial workflow owns immutable evidence. It is retained until the authorized clean local reset.
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await loginAsE2EOwner(page, "/financial/inbox");
  const baseline = await cost(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/ocr-receipt", (route) =>
    route.fulfill({
      status: 200,
      json: { vendor_name: vendor, total: 12.34, date: "2026-09-14", success: true },
    })
  );
  await gotoWithE2EAuth(page, `/upload-receipt?workerId=${worker}&projectId=${project}`);
  await expect(page.locator("form select").nth(0)).toHaveValue(worker);
  await expect(page.locator("form select").nth(1)).toHaveValue(project);
  await page
    .locator("input[type=file]")
    .setInputFiles({ name: `${vendor}.png`, mimeType: "image/png", buffer: png });
  await expect(page.getByText(/Recognizing receipt/i)).not.toBeVisible();
  await page.locator('input[placeholder="商家名称"]').fill(vendor);
  await page.locator('input[placeholder="0.00"]').fill("12.34");
  const submitted = page.waitForResponse(
    (r) => r.url().includes("/api/upload-receipt/submit") && r.request().method() === "POST"
  );
  await page.getByRole("button", { name: /Submit Receipt/i }).click();
  const submitResponse = await submitted;
  expect(submitResponse.ok(), await submitResponse.text()).toBe(true);
  await page.waitForURL((url) => !url.pathname.startsWith("/upload-receipt"));
  await page.waitForLoadState("networkidle");
  const receipt = await db.from("worker_receipts").select("*").eq("worker_id", worker).single();
  expect(receipt.error).toBeNull();
  const expense = await db
    .from("expenses")
    .select("*,expense_lines(*)")
    .eq("source_worker_receipt_id", receipt.data.id)
    .single();
  expect(expense.error).toBeNull();
  const id = expense.data.id;
  const line = expense.data.expense_lines[0].id;
  expect(expense.data.status).toBe("draft");
  expect(await cost(page)).toBe(baseline);
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoWithE2EAuth(page, `/financial/inbox?ops_record=${id}`);
  await expect(page.locator("#edit-expense-amount-input")).toBeDisabled();
  await expect(page.locator("#edit-expense-vendor-input")).toBeDisabled();
  for (const label of ["Overhead", "[E2E] Seed — HH Unified"]) {
    await page
      .locator(
        label === "Overhead"
          ? "#edit-expense-cost-allocation-select"
          : "#edit-expense-project-select"
      )
      .click();
    await page.getByRole("option", { name: label, exact: true }).click();
    const corrected = page.waitForResponse(
      (r) => r.url().endsWith(`/api/expenses/${id}/operations`) && r.request().method() === "POST"
    );
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const correction = await corrected;
    expect(correction.ok(), await correction.text()).toBe(true);
    const unchanged = await db
      .from("expenses")
      .select("id,expense_lines(id)")
      .eq("source_worker_receipt_id", receipt.data.id)
      .single();
    expect(unchanged.data?.id).toBe(id);
    expect(unchanged.data?.expense_lines.map((row) => row.id)).toEqual([line]);
    expect(await cost(page)).toBe(baseline);
  }
  await page.getByRole("combobox", { name: "Category", exact: true }).click();
  await page.getByRole("option", { name: "Other", exact: true }).click();
  const save = page.waitForResponse(
    (r) => r.url().endsWith(`/api/expenses/${id}/operations`) && r.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const saveResponse = await save;
  expect(saveResponse.ok(), await saveResponse.text()).toBe(true);
  const approve = page.waitForResponse(
    (r) => r.url().endsWith(`/api/expenses/${id}/operations`) && r.request().method() === "POST"
  );
  await page.locator("[data-expense-approval-action]").click();
  const approved = await approve;
  expect(approved.ok(), await approved.text()).toBe(true);
  const obligation = await db
    .from("worker_reimbursements")
    .select("*")
    .eq("source_worker_receipt_id", receipt.data.id)
    .single();
  expect(obligation.error).toBeNull();
  expect(await cost(page)).toBe(baseline);
  async function pay() {
    await gotoWithE2EAuth(page, `/labor/reimbursements?workerId=${worker}`);
    const row = page.locator("tbody tr").filter({ hasText: vendor }).first();
    await row.getByRole("button", { name: "Actions", exact: true }).click();
    await page.getByRole("menuitem", { name: "Record Payment", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Record Payment", exact: true });
    await dialog.getByPlaceholder(/Check|ACH/i).fill("Cash");
    const payment = page.waitForResponse(
      (r) =>
        r.url().includes(`/api/worker-reimbursements/${obligation.data.id}/pay`) &&
        r.request().method() === "POST"
    );
    await dialog.getByRole("button", { name: "Record Payment", exact: true }).click();
    const result = await payment;
    expect(result.ok(), await result.text()).toBe(true);
  }
  await pay();
  expect(await cost(page)).toBeCloseTo(baseline + 12.34, 2);
  const before = await db.from("expense_operation_events").select("id").eq("expense_id", id);
  await gotoWithE2EAuth(page, "/reports/workforce?tab=payments");
  const paidRow = page.locator("tbody tr").filter({ hasText: vendor }).first();
  const reverse = page.waitForResponse(
    (r) => r.url().includes("/api/labor/worker-payments/") && r.request().method() === "DELETE"
  );
  await paidRow.getByRole("button", { name: /Actions for payment/i }).click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
  const reversed = await reverse;
  expect(reversed.ok(), await reversed.text()).toBe(true);
  expect(await cost(page)).toBeCloseTo(baseline + 12.34, 2);
  await pay();
  const final = await db
    .from("expenses")
    .select("*,expense_lines(*)")
    .eq("source_worker_receipt_id", receipt.data.id)
    .single();
  expect(final.error).toBeNull();
  expect(final.data.id).toBe(id);
  expect(final.data.expense_lines).toHaveLength(1);
  expect(final.data.expense_lines[0].id).toBe(line);
  expect(await cost(page)).toBeCloseTo(baseline + 12.34, 2);
  const audit = await db.from("expense_operation_events").select("id").eq("expense_id", id);
  expect(audit.data?.map((row) => row.id)).toEqual(
    expect.arrayContaining(before.data!.map((row) => row.id))
  );
  const retained = await db
    .from("worker_receipts")
    .select("receipt_url")
    .eq("id", receipt.data.id)
    .single();
  expect(retained.data?.receipt_url).toBe(receipt.data.receipt_url);
  expect(pageErrors).toEqual([]);
  await info.attach("canonical-identity", {
    body: JSON.stringify({
      worker,
      receipt: receipt.data.id,
      expense: id,
      line,
      baseline,
      finalCost: await cost(page),
    }),
    contentType: "application/json",
  });
});

test("Worker retry after an ambiguous submit response reuses the original receipt", async ({
  page,
}) => {
  test.setTimeout(120000);
  const db = localDb();
  const worker = randomUUID();
  const vendor = `PW RETRY ${worker.slice(0, 8)}`;
  expect(
    (await db.from("workers").insert({ id: worker, name: vendor, status: "active" })).error
  ).toBeNull();
  await loginAsE2EOwner(page, `/upload-receipt?workerId=${worker}&projectId=${project}`);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/ocr-receipt", (route) =>
    route.fulfill({ status: 503, json: { message: "OCR unavailable locally" } })
  );
  let uploads = 0;
  let submissions = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/upload-receipt/upload")) uploads++;
  });
  await page.route("**/api/upload-receipt/submit", async (route) => {
    submissions++;
    if (submissions === 1) {
      const real = await route.fetch();
      expect(real.ok(), await real.text()).toBe(true);
      await route.fulfill({
        status: 503,
        json: { message: "Confirmation unavailable. Retry submission." },
      });
    } else await route.continue();
  });
  await page
    .locator("input[type=file]")
    .setInputFiles({ name: `${vendor}.png`, mimeType: "image/png", buffer: png });
  await page.locator('input[placeholder="商家名称"]').fill(vendor);
  await expect(page.getByText("OCR diagnostics (manual)", { exact: true })).toBeVisible();
  await page.locator('input[placeholder="商家名称"]').fill(vendor);
  await page.locator('input[placeholder="0.00"]').fill("7.89");
  await page.getByRole("button", { name: /Submit Receipt/i }).click();
  await expect(
    page.getByText("Confirmation unavailable. Retry submission.", { exact: true })
  ).toBeVisible();
  const original = await db
    .from("worker_receipts")
    .select("id,receipt_url")
    .eq("worker_id", worker)
    .single();
  expect(original.error).toBeNull();
  await page.getByRole("button", { name: /Submit Receipt/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/upload-receipt"));
  const receipts = await db
    .from("worker_receipts")
    .select("id,receipt_url")
    .eq("worker_id", worker);
  expect(receipts.data).toEqual([original.data]);
  expect(uploads).toBe(1);
  expect(submissions).toBe(2);
  const expenses = await db
    .from("expenses")
    .select("id,expense_lines(id)")
    .eq("source_worker_receipt_id", original.data!.id);
  expect(expenses.data).toHaveLength(1);
  expect(expenses.data![0].expense_lines).toHaveLength(1);
});

test("Bulk approval reports exclusions and failures and retries only unconfirmed items", async ({
  page,
}) => {
  test.setTimeout(180000);
  const { getE2EOwnerCredentials } = await import("./e2e-auth-owner");
  await loginAsE2EOwner(page, "/financial/inbox");
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  expect((await client.auth.signInWithPassword(await getE2EOwnerCredentials())).error).toBeNull();
  const cases = [
    "ready",
    "duplicate",
    "uncertain Project",
    "amount mismatch",
    "tax mismatch",
    "stale revision",
    "permission failure",
    "rejected item",
    "ambiguous response",
  ];
  const ids: string[] = [];
  for (const label of cases) {
    const created = await client.rpc("create_expense_atomic", {
      p_idempotency_key: randomUUID(),
      p_payload: {
        expenseDate: "2026-09-14",
        vendorName: `PW BULK ${label}`,
        paymentMethod: "Other",
        sourceType: "company",
        status: "needs_review",
        groups: [
          { projectId: project, lines: [{ projectId: project, category: "Other", amount: 11.11 }] },
        ],
      },
    });
    expect(created.error).toBeNull();
    ids.push(created.data.expense_id);
  }
  for (const i of [1, 2, 3, 4, 7]) {
    const flagged = await page.request.post(`/api/expenses/${ids[i]}/operations`, {
      data: {
        requestId: randomUUID(),
        revision: 0,
        action: i === 1 ? "duplicate" : "exception",
        payload: { message: cases[i] },
      },
    });
    expect(flagged.ok(), await flagged.text()).toBe(true);
  }
  await gotoWithE2EAuth(page, "/financial/inbox?date_kind=all");
  for (const id of ids)
    await page
      .locator(`[data-expense-id="${id}"]`)
      .first()
      .click({ modifiers: ["ControlOrMeta"] });
  // Another reviewer changes this record after the browser selected it.
  const stale = await page.request.post(`/api/expenses/${ids[5]}/operations`, {
    data: {
      requestId: randomUUID(),
      revision: 0,
      action: "request_info",
      payload: { message: "stale revision" },
    },
  });
  expect(stale.ok(), await stale.text()).toBe(true);
  const mutations = new Map<string, number>();
  await page.route("**/api/expenses/*/operations", async (route) => {
    const request = route.request();
    if (request.method() === "POST" && request.postDataJSON().action === "approve") {
      const id = new URL(request.url()).pathname.split("/")[3];
      mutations.set(id, (mutations.get(id) ?? 0) + 1);
      if (id === ids[6])
        return route.fulfill({ status: 403, json: { message: "Permission denied" } });
      if (id === ids[8] && mutations.get(id) === 1) {
        const real = await route.fetch();
        expect(real.ok(), await real.text()).toBe(true);
        return route.fulfill({
          status: 503,
          json: { message: "Approval confirmation unavailable; refresh before retry." },
        });
      }
    }
    await route.continue();
  });
  await page.getByRole("button", { name: "Mark Done", exact: true }).click();
  const results = page.getByRole("region", { name: "Bulk approval results" });
  await expect(results).toBeVisible();
  await expect(results).toContainText("1 approved · $11.11");
  await expect(results).toContainText("5 excluded · $55.55");
  await expect(results).toContainText("3 failed · $33.33");
  await expect(results).toContainText("$11.11");
  for (const label of cases.slice(1)) await expect(results).toContainText(new RegExp(label, "i"));
  await expect(results).toContainText("Permission denied");
  await page.getByRole("button", { name: "Mark Done", exact: true }).click();
  await expect(results).toContainText("Permission denied");
  await expect.poll(() => mutations.get(ids[6])).toBe(2);
  expect(mutations.get(ids[0])).toBe(1);
  const detail = await (await page.request.get(`/api/expenses/${ids[0]}/operations`)).json();
  expect(detail.events.filter((e: { action: string }) => e.action === "approve")).toHaveLength(1);
  expect(mutations.get(ids[8])).toBe(1);
  const ambiguous = await (await page.request.get(`/api/expenses/${ids[8]}/operations`)).json();
  expect(ambiguous.events.filter((e: { action: string }) => e.action === "approve")).toHaveLength(
    1
  );
  await client.auth.signOut();
});

test("Receipt upload, fixture extraction, Review and bank source lifecycle preserve evidence", async ({
  page,
}, info) => {
  test.setTimeout(180000);
  await loginAsE2EOwner(page, "/financial/inbox");
  const db = localDb();
  const amount = Math.floor(100000 + Math.random() * 900000) / 100;
  const vendor = `Certification Receipt Merchant ${randomUUID().slice(0, 8)}`;
  const { getE2EOwnerCredentials } = await import("./e2e-auth-owner");
  const fixtureClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  expect(
    (await fixtureClient.auth.signInWithPassword(await getE2EOwnerCredentials())).error
  ).toBeNull();
  // A valid match must not disappear behind the first 50 nonmatching date-range candidates.
  for (let i = 0; i < 51; i++) {
    const fixture = await fixtureClient.rpc("create_expense_atomic", {
      p_idempotency_key: randomUUID(),
      p_payload: {
        expenseDate: "2026-09-15",
        vendorName: `[E2E] Bank candidate distractor ${i}`,
        paymentMethod: "Cash",
        sourceType: "company",
        status: "needs_review",
        groups: [
          { projectId: null, lines: [{ projectId: null, category: "Office", amount: 1.23 }] },
        ],
      },
    });
    expect(fixture.error).toBeNull();
  }
  const image = await page.evaluate((text) => {
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 1000;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 800, 1000);
    ctx.fillStyle = "black";
    ctx.font = "30px Arial";
    ctx.fillText(text, 20, 60);
    ctx.fillText("Receipt evidence", 20, 110);
    return canvas.toDataURL("image/png").split(",")[1];
  }, vendor);
  const buffer = Buffer.from(image, "base64");
  await page.route("**/api/ocr-receipt", (route) =>
    route.fulfill({
      status: 200,
      json: {
        vendor_name: vendor,
        total_amount: amount,
        purchase_date: "2026-09-14",
        category: "Materials",
        raw_text: `${vendor}\nTOTAL $${amount.toFixed(2)}`,
        confidence: { vendor: "high", amount: "high", date: "high" },
      },
    })
  );
  await page
    .getByRole("button", { name: /^Upload receipt$/i })
    .first()
    .click();
  await page
    .getByTestId("upload-receipt-files-input")
    .setInputFiles({ name: `${vendor}.png`, mimeType: "image/png", buffer });
  const create = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/financial/expenses/quick-expense") && r.request().method() === "POST"
  );
  const extraction = page.waitForResponse(
    (r) => r.url().endsWith("/ocr-writeback") && r.request().method() === "POST"
  );
  await page.getByRole("button", { name: /Confirm Upload/ }).click();
  const created = await create;
  expect(created.ok(), await created.text()).toBe(true);
  const id = (await created.json()).expense.id;
  const extracted = await extraction;
  expect(extracted.ok(), await extracted.text()).toBe(true);
  const attachments = await db.from("attachments").select("*").eq("entity_id", id);
  expect(attachments.data).toHaveLength(1);
  expect(Number(attachments.data![0].size_bytes)).toBe(buffer.length);
  await gotoWithE2EAuth(page, "/financial/expenses/intake?source=upload");
  const intakeRow = page.locator("tbody tr").filter({ hasText: vendor });
  await expect(intakeRow).toHaveCount(1);
  await intakeRow.getByRole("link", { name: "Quick Look" }).click();
  await expect(page.locator("#edit-expense-vendor-input")).toHaveValue(vendor);
  await page.locator("#edit-expense-project-select").click();
  await page.getByRole("option", { name: "[E2E] Seed — HH Unified", exact: true }).click();
  await page.locator("#edit-expense-payment-select").click();
  await page.getByRole("option", { name: "Cash", exact: true }).click();
  const save = page.waitForResponse(
    (r) => r.url().endsWith(`/api/expenses/${id}`) && r.request().method() === "PATCH"
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const saved = await save;
  expect(saved.ok(), await saved.text()).toBe(true);
  const approve = page.waitForResponse(
    (r) => r.url().endsWith(`/api/expenses/${id}/operations`) && r.request().method() === "POST"
  );
  await page.locator("[data-expense-approval-action]").click();
  const approved = await approve;
  expect(approved.ok(), await approved.text()).toBe(true);
  await gotoWithE2EAuth(page, `/financial/expenses?date_kind=all&ops_record=${id}`);
  await expect(page.getByRole("region", { name: "Review and audit" })).toContainText("Approved");
  await gotoWithE2EAuth(page, "/financial/bank");
  const csv =
    "date,description,amount\n" +
    Array.from(
      { length: 101 },
      (_, i) =>
        `2026-09-14,${i === 0 ? vendor : `${vendor} page ${i}`},${i === 0 ? String(-amount) : String(-100 - i)}`
    ).join("\n");
  const imported = page.waitForResponse(
    (r) => r.url().endsWith("/api/financial/bank-transactions") && r.request().method() === "POST"
  );
  await page
    .locator("input[type=file]")
    .setInputFiles({ name: "cert-bank.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  const importedResponse = await imported;
  expect(importedResponse.ok(), await importedResponse.text()).toBe(true);
  await page
    .getByTestId("bank-transactions-dense-table")
    .getByRole("cell", { name: vendor, exact: true })
    .click();
  const candidate = page
    .locator(`a[href*="/financial/expenses/${id}"]`)
    .filter({ hasText: "View" })
    .locator("..");
  const linked = page.waitForResponse(
    (r) => r.url().endsWith("/api/financial/bank-transactions") && r.request().method() === "POST"
  );
  await candidate.getByRole("button", { name: "Link", exact: true }).click();
  const linkResponse = await linked;
  expect(linkResponse.ok(), await linkResponse.text()).toBe(true);
  const tx = await db.from("bank_transactions").select("*").eq("description", vendor).single();
  expect(tx.error).toBeNull();
  expect(tx.data.linked_expense_id).toBe(id);
  expect(Math.abs(Number(tx.data.amount))).toBe(amount);
  const before = await (await page.request.get(`/api/expenses/${id}/operations`)).json();
  expect(before.sources).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ source_kind: "bank_transaction", source_key: tx.data.id }),
    ])
  );
  await page.getByRole("button", { name: "reconciled", exact: true }).click();
  await page
    .getByTestId("bank-transactions-dense-table")
    .getByRole("cell", { name: vendor, exact: true })
    .click();
  const unlink = page.waitForResponse(
    (r) => r.url().endsWith("/api/financial/bank-transactions") && r.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Unlink", exact: true }).click();
  const unlinked = await unlink;
  expect(unlinked.ok(), await unlinked.text()).toBe(true);
  await page.getByRole("button", { name: "unmatched", exact: true }).click();
  await page
    .getByTestId("bank-transactions-dense-table")
    .getByRole("cell", { name: vendor, exact: true })
    .click();
  await expect(
    page.getByText(/Reassigning an unlinked bank transaction.*not supported/)
  ).toBeVisible();
  const after = await (await page.request.get(`/api/expenses/${id}/operations`)).json();
  expect(after.sources).toEqual(before.sources);
  expect(after.events.map((e: { id: string }) => e.id)).toEqual(
    expect.arrayContaining(before.events.map((e: { id: string }) => e.id))
  );
  expect((await db.from("attachments").select("*").eq("entity_id", id)).data).toEqual(
    attachments.data
  );
  const samples: number[] = [];
  for (const size of [25, 50, 100]) {
    await gotoWithE2EAuth(page, `/financial/expenses/intake?source=bank&size=${size}`);
    await expect(page.locator("tbody tr")).toHaveCount(size);
    await expect(page.getByText(`${size} sources per page`, { exact: false })).toBeVisible();
    const started = Date.now();
    await page
      .getByRole("navigation", { name: "Intake pagination" })
      .getByRole("link", { name: "Next", exact: true })
      .click();
    await expect(page.getByText(/^Page 2 of/)).toBeVisible();
    samples.push(Date.now() - started);
  }
  await fixtureClient.auth.signOut();
  await info.attach("receipt-bank-evidence", {
    body: JSON.stringify({
      expense: id,
      bank: tx.data.id,
      attachment: attachments.data![0].id,
      intakePaginationMs: samples,
    }),
    contentType: "application/json",
  });
});
