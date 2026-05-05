/**
 * Expense inbox preview modal (`ExpenseInboxPreviewModal`): image attachments show thumbnails in Attachments,
 * not filename-only links (follow inbox-view-receipt-preview-ux navigation patterns).
 */
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  E2E_FINANCIAL_EXPENSES_ARCHIVE_URL,
  E2E_FINANCIAL_INBOX_URL,
  waitForExpensesQuerySuccess,
  waitForVisibleQuickExpenseButton,
} from "./e2e-expenses-helpers";

type PageDiagnostics = {
  messages: string[];
  summarize: () => Promise<string>;
};

function attachPageDiagnostics(page: Page): PageDiagnostics {
  const messages: string[] = [];
  page.on("pageerror", (err) => messages.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      messages.push(`console.${msg.type()}: ${msg.text()}`);
    }
  });
  page.on("requestfailed", (req) => {
    const url = req.url();
    if (url.includes("/_next/") || url.includes("/financial/")) {
      messages.push(`requestfailed: ${req.method()} ${url} ${req.failure()?.errorText ?? ""}`);
    }
  });
  page.on("response", (res) => {
    const url = res.url();
    if (res.status() >= 400 && (url.includes("/_next/") || url.includes("/financial/"))) {
      messages.push(`response: ${res.status()} ${url}`);
    }
  });
  return {
    messages,
    summarize: async () => {
      const bodyText = await page
        .locator("body")
        .innerText({ timeout: 1_000 })
        .catch(() => "");
      return [
        `url=${page.url()}`,
        `body=${bodyText.replace(/\s+/g, " ").trim().slice(0, 500) || "(empty)"}`,
        `diagnostics=${messages.slice(-20).join(" | ") || "(none)"}`,
      ].join(" ");
    },
  };
}

function hasNextStaticAssetFailure(messages: string[]): boolean {
  return messages.some(
    (msg) =>
      msg.includes("/_next/static/") && (msg.includes("404") || msg.includes("requestfailed:"))
  );
}

/** AppShell is `ssr: false`; `main` is absent until the client shell and list controls hydrate. */
async function waitForExpensesListShell(
  page: Page,
  diagnostics: PageDiagnostics,
  timeoutMs = 150_000
): Promise<void> {
  try {
    await waitForVisibleQuickExpenseButton(page, timeoutMs);
    await page.locator("main").first().waitFor({ state: "visible", timeout: 30_000 });
  } catch (err) {
    throw new Error(
      `${err instanceof Error ? err.message : String(err)}. ${await diagnostics.summarize()}`
    );
  }
}

async function gotoExpensesRouteReady(
  page: Page,
  diagnostics: PageDiagnostics,
  url: string,
  totalTimeoutMs: number
): Promise<void> {
  const deadline = Date.now() + totalTimeoutMs;
  let lastErr: unknown = null;
  for (let attempt = 1; Date.now() < deadline; attempt += 1) {
    const recentFrom = diagnostics.messages.length;
    const remainingForGoto = Math.max(5_000, Math.min(60_000, deadline - Date.now()));
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: remainingForGoto });

    try {
      const remainingForShell = Math.max(5_000, Math.min(25_000, deadline - Date.now()));
      await waitForExpensesListShell(page, diagnostics, remainingForShell);
      return;
    } catch (err) {
      lastErr = err;
      const recentMessages = diagnostics.messages.slice(recentFrom);
      if (!hasNextStaticAssetFailure(recentMessages) || Date.now() >= deadline) {
        throw err;
      }
      await page.waitForTimeout(Math.min(500 * attempt, 2_000));
    }
  }

  if (lastErr instanceof Error) throw lastErr;
  throw new Error(`Timed out waiting for ${url}. ${await diagnostics.summarize()}`);
}

async function gotoInboxReady(page: Page, diagnostics: PageDiagnostics): Promise<void> {
  await page.setViewportSize({ width: 1400, height: 900 });

  // Warm the shared expenses shell first. Direct cold loads of `/financial/inbox` can leave only
  // toast roots rendered while the CSR app shell/page chunks finish compiling in `next dev`.
  await gotoExpensesRouteReady(page, diagnostics, E2E_FINANCIAL_EXPENSES_ARCHIVE_URL, 120_000);

  await gotoExpensesRouteReady(page, diagnostics, E2E_FINANCIAL_INBOX_URL, 120_000);
  await waitForExpensesQuerySuccess(page, 90_000);
}

/** Unique 1x1 PNG per call - fixed PNG bytes dedupe across upload runs after browser compression. */
async function uniqueOneByOnePngBuffer(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    const x = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
    ctx.fillStyle = `rgb(${x & 255}, ${(x >>> 8) & 255}, ${(x >>> 16) & 255})`;
    ctx.fillRect(0, 0, 1, 1);
    return c.toDataURL("image/png").split(",")[1] ?? null;
  });
  if (!b64) throw new Error("canvas PNG generation failed");
  return Buffer.from(b64, "base64");
}

async function waitForUploadHighlightRow(page: Page, timeoutMs: number) {
  await expect
    .poll(
      async () =>
        page
          .locator("main tr.exp-row[class*='185,129'], main li.exp-row[class*='185,129']")
          .count(),
      { timeout: timeoutMs, intervals: [50, 100, 100, 200, 400] }
    )
    .toBeGreaterThan(0);
  return page
    .locator("main tr.exp-row[class*='185,129'], main li.exp-row[class*='185,129']")
    .first();
}

async function findUploadedExpenseIdByRef(inboxRef: string): Promise<string | null> {
  const adminUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!adminUrl || !adminKey) return null;

  const admin = createClient(adminUrl, adminKey);
  const { data, error } = await admin
    .from("expenses")
    .select("id")
    .eq("reference_no", inboxRef)
    .maybeSingle();

  if (error) throw new Error(`expected uploaded expense lookup to succeed: ${error.message}`);
  return String((data as { id?: string } | null)?.id ?? "") || null;
}

async function waitForUploadedDraftRow(
  page: Page,
  uploadedExpenseId: string | null,
  timeoutMs: number
) {
  if (uploadedExpenseId) {
    const row = page.locator(`main .exp-row[data-expense-id="${uploadedExpenseId}"]`).first();
    await expect(row).toBeVisible({ timeout: timeoutMs });
    return row;
  }
  return await waitForUploadHighlightRow(page, timeoutMs);
}

test.describe("Expense inbox preview - attachment thumbnails", () => {
  test.describe.configure({ timeout: 300_000, retries: 0 });

  test("preview modal shows img in Attachments (not filename-only)", async ({ page }) => {
    const diagnostics = attachPageDiagnostics(page);
    const uniqueName = `thumb-e2e-${Date.now()}.png`;
    let uploadedInboxRef: string | null = null;
    let uploadedExpenseId: string | null = null;

    await test.step("go to Inbox", async () => {
      await gotoInboxReady(page, diagnostics);
      if (
        await page
          .getByText(/Configure Supabase to upload/i)
          .isVisible()
          .catch(() => false)
      ) {
        test.skip(true, "Browser Supabase client not configured.");
      }
    });

    await test.step("upload inbox draft image (PNG)", async () => {
      await page
        .getByRole("button", { name: /upload receipt/i })
        .first()
        .click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("heading", { name: /upload receipt/i })).toBeVisible({
        timeout: 15_000,
      });
      const pngBuf = await uniqueOneByOnePngBuffer(page);
      await dialog.locator('input[type="file"][multiple]').setInputFiles({
        name: uniqueName,
        mimeType: "image/png",
        buffer: pngBuf,
      });
      await expect(dialog.getByText(/Selected receipts/i)).toBeVisible({ timeout: 15_000 });
      const confirmUpload = dialog.getByRole("button", { name: /Confirm Upload \(1\)/ });
      await confirmUpload.scrollIntoViewIfNeeded();
      await confirmUpload.click();
      await expect(
        page
          .locator('[role="status"]')
          .filter({ hasText: /Added \d+ draft(?:s)? to Inbox|Already uploaded/i })
      ).toBeVisible({ timeout: 120_000 });
      await expect(page).toHaveURL(/[?&]highlight=INBOX-UP-/i, { timeout: 120_000 });
      const raw = new URL(page.url()).searchParams.get("highlight")?.split(",")[0]?.trim();
      if (!raw) throw new Error("expected highlight= after upload");
      uploadedInboxRef = raw;
      uploadedExpenseId = await findUploadedExpenseIdByRef(raw);
      await expect(page.locator('[role="dialog"]')).toHaveCount(0, { timeout: 15_000 });
    });

    await test.step("open expense preview from highlighted row", async () => {
      await waitForExpensesQuerySuccess(page, 90_000);
      const row = await waitForUploadedDraftRow(page, uploadedExpenseId, 120_000);
      await row.scrollIntoViewIfNeeded();
      await row.click();
    });

    expect(uploadedInboxRef).toMatch(/^INBOX-UP-/);

    const expenseDialog = page.getByRole("dialog", { name: /^Expense$/ });
    await expect(expenseDialog).toBeVisible({ timeout: 15_000 });

    const attachments = expenseDialog.getByTestId("expense-preview-attachments");
    await expect(attachments).toBeVisible();
    await expect(attachments.locator("img")).toBeVisible({ timeout: 120_000 });

    await expect(attachments.getByText(uniqueName)).not.toBeVisible();
    await expect(attachments.getByText(/Preview unavailable/i)).not.toBeVisible();
  });
});
