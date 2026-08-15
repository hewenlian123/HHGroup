import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";
import { hawaiiTodayYmd } from "@/lib/hawaii-calendar-date";
import { ensureE2EOwner, loginAsE2EOwner } from "./e2e-auth-owner";

const TARGET_EXPENSE_ID = "81f1a961-b6ad-4a14-9ff1-1010d89f0101";
const OTHER_EXPENSE_ID = "81f1a961-b6ad-4a14-9ff1-1010d89f0102";
const TARGET_ATTACHMENT_ID = "81f1a961-b6ad-4a14-9ff1-1010d89f0201";
const OTHER_ATTACHMENT_ID = "81f1a961-b6ad-4a14-9ff1-1010d89f0202";
const TARGET_LINE_ID = "81f1a961-b6ad-4a14-9ff1-1010d89f0301";
const OTHER_LINE_ID = "81f1a961-b6ad-4a14-9ff1-1010d89f0302";
const RUN_ID = randomUUID();
const TARGET_PATH = `e2e-receipt-security/${RUN_ID}-target-original.png`;
const OTHER_PATH = `e2e-receipt-security/${RUN_ID}-other-original.png`;
const TARGET_VENDOR = "Private Receipt Target";

const ORIGINAL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);
const REPLACEMENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAQAAABV7bNHAAAADUlEQVR42mNk+M/wHwAEAQH/6BHtWQAAAABJRU5ErkJggg==",
  "base64"
);

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

type ManifestBody = {
  ok: boolean;
  expenseId: string;
  items: Array<{
    id: string;
    fileName: string;
    mimeType: string;
    referenceVersion: string;
    signedUrl: string;
  }>;
};

function localAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRole =
    process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRole) {
    throw new Error("Local receipt-security E2E requires Supabase environment variables.");
  }
  const host = new URL(url).hostname;
  if (host !== "localhost" && host !== "127.0.0.1") {
    throw new Error("Receipt-security fixtures are local-Docker only.");
  }
  return createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

function localDatabase() {
  const databaseUrl =
    process.env.SUPABASE_DATABASE_URL?.trim() ??
    process.env.DATABASE_URL?.trim() ??
    process.env.SUPABASE_DB_URL?.trim();
  if (!databaseUrl) {
    throw new Error("Local receipt-security E2E requires the local Docker database URL.");
  }
  const parsed = new URL(databaseUrl);
  if (
    (parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") ||
    parsed.port !== "54322"
  ) {
    throw new Error("Receipt-security fixture cleanup is restricted to local Docker Postgres.");
  }
  return postgres(databaseUrl, { max: 1, prepare: false });
}

async function removeFixtureData(
  admin: SupabaseClient,
  database: ReturnType<typeof postgres>
): Promise<void> {
  const { data: cleanupRows } = await admin
    .from("receipt_storage_cleanup_candidates")
    .select("replacement_path")
    .in("expense_id", [TARGET_EXPENSE_ID, OTHER_EXPENSE_ID]);
  const replacementPaths = (cleanupRows ?? [])
    .map((row) => String(row.replacement_path ?? ""))
    .filter(Boolean);

  await database`
    delete from public.receipt_storage_cleanup_candidates
    where expense_id in (${TARGET_EXPENSE_ID}, ${OTHER_EXPENSE_ID})
  `;
  await admin.from("attachments").delete().in("id", [TARGET_ATTACHMENT_ID, OTHER_ATTACHMENT_ID]);
  await admin.from("expense_lines").delete().in("id", [TARGET_LINE_ID, OTHER_LINE_ID]);
  await admin.from("expenses").delete().in("id", [TARGET_EXPENSE_ID, OTHER_EXPENSE_ID]);
  await admin.storage
    .from("expense-attachments")
    .remove([TARGET_PATH, OTHER_PATH, ...replacementPaths]);
}

test.describe.serial("private expense receipt Storage and Replace", () => {
  test.describe.configure({ timeout: 120_000 });
  const admin = localAdmin();
  const database = localDatabase();

  test.beforeAll(async () => {
    await ensureE2EOwner();
    await removeFixtureData(admin, database);

    for (const path of [TARGET_PATH, OTHER_PATH]) {
      const upload = await admin.storage
        .from("expense-attachments")
        .upload(path, ORIGINAL_PNG, { contentType: "image/png", upsert: false });
      if (upload.error) throw new Error("Unable to create local receipt-security fixture.");
    }

    const today = hawaiiTodayYmd();
    const expenses = await admin.from("expenses").insert([
      {
        id: TARGET_EXPENSE_ID,
        amount: 12.34,
        total: 12.34,
        expense_date: today,
        vendor_name: TARGET_VENDOR,
        vendor: TARGET_VENDOR,
        source_type: "receipt_upload",
        status: "draft",
        receipt_url: null,
      },
      {
        id: OTHER_EXPENSE_ID,
        amount: 56.78,
        total: 56.78,
        expense_date: today,
        vendor_name: "Private Receipt Other",
        vendor: "Private Receipt Other",
        source_type: "receipt_upload",
        status: "draft",
        receipt_url: null,
      },
    ]);
    if (expenses.error) throw new Error("Unable to create local receipt-security expenses.");

    const lines = await admin.from("expense_lines").insert([
      {
        id: TARGET_LINE_ID,
        expense_id: TARGET_EXPENSE_ID,
        amount: 12.34,
        total: 12.34,
        category: "Other",
      },
      {
        id: OTHER_LINE_ID,
        expense_id: OTHER_EXPENSE_ID,
        amount: 56.78,
        total: 56.78,
        category: "Other",
      },
    ]);
    if (lines.error) throw new Error("Unable to create local receipt-security lines.");

    const attachments = await admin.from("attachments").insert([
      {
        id: TARGET_ATTACHMENT_ID,
        entity_type: "expense",
        entity_id: TARGET_EXPENSE_ID,
        file_name: "target-original.png",
        file_path: TARGET_PATH,
        mime_type: "image/png",
        size_bytes: ORIGINAL_PNG.byteLength,
      },
      {
        id: OTHER_ATTACHMENT_ID,
        entity_type: "expense",
        entity_id: OTHER_EXPENSE_ID,
        file_name: "other-original.png",
        file_path: OTHER_PATH,
        mime_type: "image/png",
        size_bytes: ORIGINAL_PNG.byteLength,
      },
    ]);
    if (attachments.error) throw new Error("Unable to create local receipt-security attachments.");
  });

  test.afterAll(async () => {
    await removeFixtureData(admin, database);
    await database.end({ timeout: 5 });
  });

  test("anonymous Viewer and Replace are denied", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL });
    const request = context.request;
    const viewer = await request.get(`/api/financial/expenses/${TARGET_EXPENSE_ID}/receipts`);
    expect(viewer.status()).toBe(401);

    const replace = await request.post(
      `/api/financial/expenses/${TARGET_EXPENSE_ID}/receipts/attachment.${TARGET_ATTACHMENT_ID}/replace`,
      {
        multipart: {
          file: { name: "replacement.png", mimeType: "image/png", buffer: REPLACEMENT_PNG },
          idempotencyKey: "81f1a961-b6ad-4a14-9ff1-1010d89f0401",
          referenceVersion: "a".repeat(64),
        },
      }
    );
    expect(replace.status()).toBe(401);
    await context.close();
  });

  test("historical path-only attachment opens from Expense detail through the canonical bucket", async ({
    page,
  }) => {
    await loginAsE2EOwner(page, `/financial/expenses/${TARGET_EXPENSE_ID}`);
    await expect(page.getByText("target-original.png", { exact: true })).toBeVisible();

    const previewResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().endsWith(`/api/expenses/${TARGET_EXPENSE_ID}/attachments`)
    );
    await page.getByRole("button", { name: "Preview receipt" }).click();

    const response = await previewResponse;
    expect(response.status()).toBe(200);
    const responseText = await response.text();
    expect(responseText).not.toMatch(/file_path|rawReference|quick-expense|token=secret/i);

    const preview = page.locator("[data-attachment-preview-modal]");
    await expect(preview).toBeVisible();
    const image = preview.locator("img");
    await expect(image).toBeVisible();
    await expect
      .poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
  });

  test("owner Viewer signs privately and UI Replace changes only the selected expense", async ({
    page,
  }) => {
    await loginAsE2EOwner(page, "/financial/inbox");
    const manifestResponse = await page.request.get(
      `/api/financial/expenses/${TARGET_EXPENSE_ID}/receipts?request=${randomUUID()}`,
      { headers: { "Cache-Control": "no-cache" } }
    );
    expect(manifestResponse.status()).toBe(200);
    const beforeManifest = (await manifestResponse.json()) as ManifestBody;
    expect(beforeManifest.items).toHaveLength(1);
    expect(beforeManifest.items[0]).toMatchObject({
      id: `attachment.${TARGET_ATTACHMENT_ID}`,
      mimeType: "image/png",
      referenceVersion: expect.stringMatching(/^[a-f0-9]{64}$/),
      signedUrl: expect.stringContaining("/storage/v1/object/sign/expense-attachments/"),
    });
    expect(decodeURIComponent(new URL(beforeManifest.items[0]!.signedUrl).pathname)).toContain(
      TARGET_PATH
    );
    expect(JSON.stringify(beforeManifest)).not.toMatch(/file_path|rawReference|old_path/);

    const browserStorageWrites: string[] = [];
    page.on("request", (request) => {
      if (request.method() !== "GET" && request.url().includes("/storage/v1/object/")) {
        browserStorageWrites.push(request.url());
      }
    });

    await page.getByRole("textbox", { name: "Search expenses" }).fill(TARGET_VENDOR);
    await expect(page.getByText(TARGET_VENDOR, { exact: true })).toBeVisible();
    const targetExpenseRow = page.locator(`[data-expense-id="${TARGET_EXPENSE_ID}"]`).first();
    await expect(targetExpenseRow).toBeVisible();
    await targetExpenseRow
      .getByRole("button", { name: "Receipt attached. Preview receipt" })
      .click();
    await expect(page.getByRole("dialog", { name: "Receipt preview" })).toBeVisible();
    const image = page.locator("[data-receipt-viewer] img");
    await expect(image).toBeVisible();
    await expect
      .poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);

    const chooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Replace" }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles({
      name: "replacement.png",
      mimeType: "image/png",
      buffer: REPLACEMENT_PNG,
    });
    await expect(page.getByText("Receipt replaced", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Replace" })).toBeEnabled();

    const { data: targetRow } = await admin
      .from("attachments")
      .select("file_path")
      .eq("id", TARGET_ATTACHMENT_ID)
      .single();
    const { data: otherRow } = await admin
      .from("attachments")
      .select("file_path")
      .eq("id", OTHER_ATTACHMENT_ID)
      .single();
    const newPath = String(targetRow?.file_path ?? "");
    expect(newPath).toMatch(
      new RegExp(`^replacements/expenses/${TARGET_EXPENSE_ID}/[0-9a-f-]{36}\\.png$`)
    );
    expect(newPath).not.toMatch(/^https?:|[?#]|token=/);
    expect(otherRow?.file_path).toBe(OTHER_PATH);

    const { data: oldObject } = await admin.storage
      .from("expense-attachments")
      .download(TARGET_PATH);
    expect(oldObject).toBeTruthy();
    const { data: cleanup } = await admin
      .from("receipt_storage_cleanup_candidates")
      .select("old_bucket, old_path, replacement_path, status")
      .eq("expense_id", TARGET_EXPENSE_ID)
      .single();
    expect(cleanup).toMatchObject({
      old_bucket: "expense-attachments",
      old_path: TARGET_PATH,
      replacement_path: newPath,
      status: "pending",
    });

    const refreshedResponse = await page.request.get(
      `/api/financial/expenses/${TARGET_EXPENSE_ID}/receipts?refresh=${Date.now()}`,
      { headers: { "Cache-Control": "no-cache" } }
    );
    expect(refreshedResponse.headers()["cache-control"]).toContain("no-store");
    const refreshed = (await refreshedResponse.json()) as ManifestBody;
    expect(new URL(refreshed.items[0]!.signedUrl).pathname).toContain(newPath);
    const downloaded = await page.request.get(refreshed.items[0]!.signedUrl);
    expect(downloaded.status()).toBe(200);
    const signedBytes = await downloaded.body();
    const { data: storedObject, error: storedObjectError } = await admin.storage
      .from("expense-attachments")
      .download(newPath);
    expect(storedObjectError).toBeNull();
    const storedBytes = Buffer.from(await storedObject!.arrayBuffer());
    expect({
      signedLength: signedBytes.byteLength,
      signedSha256: sha256(signedBytes),
      storedLength: storedBytes.byteLength,
      storedSha256: sha256(storedBytes),
    }).toEqual({
      signedLength: REPLACEMENT_PNG.byteLength,
      signedSha256: sha256(REPLACEMENT_PNG),
      storedLength: REPLACEMENT_PNG.byteLength,
      storedSha256: sha256(REPLACEMENT_PNG),
    });
    expect(browserStorageWrites).toEqual([]);
  });
});
