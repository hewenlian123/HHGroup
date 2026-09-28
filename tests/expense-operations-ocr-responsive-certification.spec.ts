import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";
import { gotoWithE2EAuth, loginAsE2EOwner } from "./e2e-auth-owner";

// These tests inject outages/extraction responses; none certifies a cloud OCR provider.
// Canonical financial evidence is retained for the user-authorized clean local reset.
test.use({ actionTimeout: 15_000 });
test.describe.configure({ mode: "serial", timeout: 120_000 });
const diagnostics = new WeakMap<
  Page,
  {
    pageErrors: string[];
    consoleErrors: Array<{ text: string; url: string }>;
    injectedFailures: Set<string>;
  }
>();

test.beforeEach(async ({ page }) => {
  expect(["localhost", "127.0.0.1"]).toContain(new URL(process.env.E2E_BASE_URL!).hostname);
  expect(["localhost", "127.0.0.1"]).toContain(
    new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname
  );
  const state = {
    pageErrors: [] as string[],
    consoleErrors: [] as Array<{ text: string; url: string }>,
    injectedFailures: new Set<string>(),
  };
  diagnostics.set(page, state);
  page.on("pageerror", (error) => state.pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error")
      state.consoleErrors.push({ text: message.text(), url: message.location().url });
  });
});

test.afterEach(async ({ page }, info) => {
  const state = diagnostics.get(page)!;
  await info.attach("ocr-browser-diagnostics", {
    body: JSON.stringify({
      ...state,
      injectedFailures: [...state.injectedFailures],
      cloudOcr: "NOT CERTIFIED; injected test responses only",
    }),
    contentType: "application/json",
  });
  expect(state.pageErrors).toEqual([]);
  expect(
    state.consoleErrors.filter(
      (error) =>
        !(
          state.injectedFailures.has(new URL(error.url || "http://invalid.local").pathname) &&
          /Failed to load resource: the server responded with a status of 503/.test(error.text)
        )
    )
  ).toEqual([]);
});

function localDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}

async function originalReceipt(page: Page) {
  const name = `PW OCR Certification Merchant ${randomUUID()}.png`;
  const data = await page.evaluate((text) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 1600;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "black";
    context.font = "24px Arial";
    context.fillText(text, 30, 70);
    context.fillText("Preserve this original evidence during OCR failure", 30, 120);
    return canvas.toDataURL("image/png").split(",")[1];
  }, name);
  return { name, mimeType: "image/png", buffer: Buffer.from(data, "base64") };
}

async function selectUpload(page: Page, file: Awaited<ReturnType<typeof originalReceipt>>) {
  await page
    .getByRole("button", { name: /^Upload receipt$/i })
    .first()
    .click();
  await page.getByTestId("upload-receipt-files-input").setInputFiles(file);
}

async function assertOriginalDraft(
  page: Page,
  id: string,
  file: Awaited<ReturnType<typeof originalReceipt>>
) {
  const db = localDb();
  const record = await db
    .from("expenses")
    .select("id,status,expense_date,reference_no,vendor_name,source_type,expense_lines(id,amount)")
    .eq("id", id)
    .single();
  expect(record.error).toBeNull();
  expect(record.data).toMatchObject({
    id,
    status: "draft",
    vendor_name: "Unknown",
    source_type: "receipt_upload",
  });
  expect(record.data!.expense_lines).toHaveLength(1);
  expect(Number(record.data!.expense_lines[0].amount)).toBe(0.01);
  const attachments = await db
    .from("attachments")
    .select("id,file_name,file_path,size_bytes")
    .eq("entity_type", "expense")
    .eq("entity_id", id);
  expect(attachments.error).toBeNull();
  expect(attachments.data).toHaveLength(1);
  expect(attachments.data![0].file_name).toBe(file.name);
  expect(Number(attachments.data![0].size_bytes)).toBe(file.buffer.length);
  const manifestResponse = await page.request.get(`/api/financial/expenses/${id}/receipts`);
  expect(manifestResponse.ok(), await manifestResponse.text()).toBe(true);
  const manifest = await manifestResponse.json();
  expect(manifest.items).toHaveLength(1);
  const original = await page.request.get(manifest.items[0].signedUrl);
  expect(original.ok(), await original.text()).toBe(true);
  expect(
    createHash("sha256")
      .update(await original.body())
      .digest("hex")
  ).toBe(createHash("sha256").update(file.buffer).digest("hex"));
  const operationResponse = await page.request.get(`/api/expenses/${id}/operations`);
  expect(operationResponse.ok(), await operationResponse.text()).toBe(true);
  const operation = await operationResponse.json();
  expect(operation.state?.posted_at ?? null).toBeNull();
  expect(operation.state?.review_state ?? "pending").toBe("pending");
  expect(
    operation.events.filter((event: { action: string }) =>
      ["approve", "post"].includes(event.action)
    )
  ).toEqual([]);
  return { record: record.data!, attachments: attachments.data! };
}

test("Injected OCR outage preserves the original draft and same-file upload retry creates no duplicate", async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    // Deliberately make browser fallback unavailable too; no CDN/model download is required.
    const NativeWorker = window.Worker;
    window.Worker = new Proxy(NativeWorker, {
      construct(target, args) {
        if (String(args[0]).startsWith("blob:"))
          throw new Error("Injected local OCR worker unavailable");
        return Reflect.construct(target, args);
      },
    });
  });
  diagnostics.get(page)!.injectedFailures.add("/api/ocr-receipt");
  let ocrCalls = 0;
  let creates = 0;
  let uploads = 0;
  page.on("request", (request) => {
    if (request.method() !== "POST") return;
    if (request.url().endsWith("/api/financial/expenses/quick-expense")) creates++;
    if (request.url().endsWith("/api/quick-expense/upload-attachment")) uploads++;
  });
  await page.route("**/api/ocr-receipt", (route) => {
    ocrCalls++;
    return route.fulfill({ status: 503, json: { message: "Injected OCR provider unavailable" } });
  });
  await loginAsE2EOwner(page, "/financial/inbox");
  const file = await originalReceipt(page);
  await selectUpload(page, file);
  const create = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/financial/expenses/quick-expense") &&
      response.request().method() === "POST"
  );
  const extraction = page.waitForResponse(
    (response) =>
      response.url().endsWith("/ocr-writeback") && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: /Confirm Upload/ }).click();
  const created = await create;
  expect(created.ok(), await created.text()).toBe(true);
  const id = (await created.json()).expense.id as string;
  const written = await extraction;
  expect(written.ok(), await written.text()).toBe(true);
  expect(await written.json()).toMatchObject({
    changedFields: [],
    message: "Receipt OCR found no safe fields to apply.",
  });
  const before = await assertOriginalDraft(page, id, file);
  await gotoWithE2EAuth(page, `/financial/inbox?date_kind=all&ops_record=${id}`);
  await expect(page.locator("#edit-expense-vendor-input")).toHaveValue("Unknown");
  await expect(page.locator("#edit-expense-vendor-input")).toBeEditable();
  await expect(page.locator("#edit-expense-amount-input")).toBeEditable();
  await selectUpload(page, file);
  await page.getByRole("button", { name: /Confirm Upload/ }).click();
  await expect(page.getByText("Receipt already in Inbox", { exact: true })).toBeVisible();
  await expect(page.getByText("No duplicate drafts were created.", { exact: true })).toBeVisible();
  const after = await assertOriginalDraft(page, id, file);
  expect(after).toEqual(before);
  const sameSource = await localDb()
    .from("expenses")
    .select("id")
    .eq("reference_no", before.record.reference_no);
  expect(sameSource.error).toBeNull();
  expect(sameSource.data).toEqual([{ id }]);
  expect({ ocrCalls, creates, uploads }).toEqual({ ocrCalls: 1, creates: 1, uploads: 1 });
  await info.attach("retained-local-ocr-fixture", {
    body: JSON.stringify({
      expenseId: id,
      reference: before.record.reference_no,
      fileName: file.name,
      cloudOcr: "NOT CERTIFIED",
      sameFileRetry: "deduplicated; does not rerun OCR",
    }),
    contentType: "application/json",
  });
});

test("Upload retry and injected OCR writeback error preserve evidence; tablet queue and actions remain reachable", async ({
  page,
}, info) => {
  await loginAsE2EOwner(page, "/financial/inbox");
  const file = await originalReceipt(page);
  let uploads = 0;
  let creates = 0;
  diagnostics.get(page)!.injectedFailures.add("/api/quick-expense/upload-attachment");
  await page.route("**/api/quick-expense/upload-attachment", async (route) => {
    uploads++;
    if (uploads === 1)
      return route.fulfill({ status: 503, json: { message: "Injected storage unavailable" } });
    await route.continue();
  });
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      request.url().endsWith("/api/financial/expenses/quick-expense")
    )
      creates++;
  });
  // Fixture extraction only: it lets us exercise a real persisted draft with failed writeback.
  await page.route("**/api/ocr-receipt", (route) =>
    route.fulfill({
      status: 200,
      json: {
        vendor_name: "Certification Receipt Merchant Supply Company",
        total_amount: 39.91,
        purchase_date: "2026-09-14",
        category: "Materials",
        raw_text: "Certification Receipt Merchant Supply Company\nTOTAL $39.91",
        confidence: { vendor: "high", amount: "high", date: "high" },
      },
    })
  );
  await page.route("**/ocr-writeback", (route) => {
    diagnostics.get(page)!.injectedFailures.add(new URL(route.request().url()).pathname);
    return route.fulfill({
      status: 503,
      json: { message: "Injected OCR persistence unavailable" },
    });
  });
  await selectUpload(page, file);
  await page.getByRole("button", { name: /Confirm Upload/ }).click();
  await expect(page.getByText("Upload could not complete", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Receipt upload failed. Sign in again or retry.", { exact: true })
  ).toBeVisible();
  expect(creates).toBe(0);
  const create = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/financial/expenses/quick-expense") &&
      response.request().method() === "POST"
  );
  const extraction = page.waitForResponse(
    (response) =>
      response.url().endsWith("/ocr-writeback") && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: /Retry failed/ }).click();
  const created = await create;
  expect(created.ok(), await created.text()).toBe(true);
  const id = (await created.json()).expense.id as string;
  expect((await extraction).status()).toBe(503);
  await expect(page.getByText("Receipt needs review", { exact: true }).first()).toBeVisible();
  const before = await assertOriginalDraft(page, id, file);
  expect({ creates, uploads }).toEqual({ creates: 1, uploads: 2 });
  await page.setViewportSize({ width: 1024, height: 768 });
  await gotoWithE2EAuth(page, `/financial/inbox?date_kind=all&ops_record=${id}`);
  const dateLabel = await page.evaluate(
    (date) =>
      new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    before.record.expense_date
  );
  const dateGroup = page
    .locator("[data-expenses-ledger] button[aria-expanded]")
    .filter({ hasText: dateLabel });
  await expect(dateGroup).toHaveCount(1);
  if ((await dateGroup.getAttribute("aria-expanded")) === "false") await dateGroup.click();
  const row = page.locator(`[data-expenses-ledger] [data-expense-id="${id}"]`).first();
  await row.scrollIntoViewIfNeeded();
  await expect(row).toBeInViewport();
  const evidence = page.getByRole("region", { name: "Receipt Evidence", exact: true });
  await expect(evidence).toBeVisible();
  await evidence.scrollIntoViewIfNeeded();
  await expect(evidence).toBeInViewport();
  await expect(row).toBeInViewport();
  const queue = await page.locator("[data-expenses-ledger]").boundingBox();
  const data = await page.locator("[data-expense-detail-panel]").boundingBox();
  expect(queue).not.toBeNull();
  expect(data).not.toBeNull();
  expect(data!.x).toBeGreaterThanOrEqual(queue!.x + queue!.width - 1);
  const pagination = page.locator("[data-inbox-pagination]");
  const unitLabel = await pagination.getByText("Date groups/page", { exact: true }).boundingBox();
  expect(unitLabel).not.toBeNull();
  expect(unitLabel!.x).toBeGreaterThanOrEqual(queue!.x);
  expect(unitLabel!.x + unitLabel!.width).toBeLessThanOrEqual(queue!.x + queue!.width);
  expect(unitLabel!.y).toBeGreaterThanOrEqual(queue!.y);
  expect(unitLabel!.y + unitLabel!.height).toBeLessThanOrEqual(queue!.y + queue!.height);
  const previousPage = await pagination
    .getByRole("button", { name: "Previous page", exact: true })
    .boundingBox();
  const nextPage = await pagination
    .getByRole("button", { name: "Next page", exact: true })
    .boundingBox();
  expect(previousPage).not.toBeNull();
  expect(nextPage).not.toBeNull();
  expect(Math.abs(previousPage!.y - nextPage!.y)).toBeLessThan(1);
  const footer = page.locator("[data-expense-inline-review-actions]");
  await expect(footer.locator("[data-expense-approval-action]")).toBeInViewport({ ratio: 1 });
  await info.attach("tablet-before-field-scroll", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
  await footer.getByRole("button", { name: "Request Info", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Review message", exact: true })).toBeFocused();
  await expect(row).toBeInViewport();
  await expect(footer.locator("[data-expense-approval-action]")).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await info.attach("tablet-after-field-scroll", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
  expect(await assertOriginalDraft(page, id, file)).toEqual(before);
  await info.attach("retained-local-ocr-fixture", {
    body: JSON.stringify({
      expenseId: id,
      reference: before.record.reference_no,
      fileName: file.name,
      cloudOcr: "NOT CERTIFIED; fixture extraction followed by writeback outage",
    }),
    contentType: "application/json",
  });
});
