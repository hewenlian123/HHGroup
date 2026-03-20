import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

function trimBaseUrl(base: string): string {
  return base.replace(/\/$/, "");
}

/** Auto-accept `window.confirm` / `alert` (e.g. vendor/category/worker delete). Register in `test.beforeEach`. */
export function acceptBrowserDialogs(page: Page): void {
  page.on("dialog", (d) => void d.accept());
}

/**
 * Delete controls should be visible without hovering the row (regression guard for opacity-0 + group-hover).
 * `locator` should scope to one row or the actions cell.
 */
export async function expectDeleteControlVisibleWithoutHover(
  page: Page,
  deleteButton: ReturnType<Page["locator"]>,
  maxMs = 800
): Promise<void> {
  const start = Date.now();
  await expect(deleteButton).toBeVisible({ timeout: maxMs });
  expect(Date.now() - start, "Delete control should appear immediately (no hover delay)").toBeLessThanOrEqual(maxMs + 150);
}

/**
 * Row-scoped trash (`DeleteRowAction`) → Radix `ConfirmDialog`: assert dialog opens quickly, then confirm.
 */
export async function clickTrashInRowAndConfirmDialog(
  page: Page,
  row: ReturnType<Page["locator"]>,
  opts: { maxDialogOpenMs?: number } = {}
): Promise<void> {
  const { maxDialogOpenMs = 1200 } = opts;
  const trash = row.getByRole("button", { name: "Delete" });
  const t0 = Date.now();
  await trash.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: maxDialogOpenMs });
  expect(Date.now() - t0, "Confirm dialog should open quickly").toBeLessThan(maxDialogOpenMs + 250);
  await dialog.getByRole("button", { name: /^Delete$/ }).click();
}

export type CreateDraftInvoiceResult =
  | { ok: true }
  | { ok: false; skipReason: string };

/**
 * Self-contained: open New Invoice, pick first real project, minimal line + client, submit.
 * Use with `test.skip(!r.ok, r.ok ? "" : r.skipReason)` when projects may be empty.
 */
export async function tryCreateDraftInvoiceNavigateToDetail(
  page: Page,
  baseUrl: string,
  options?: { clientName?: string; lineDescription?: string }
): Promise<CreateDraftInvoiceResult> {
  await page.goto(`${trimBaseUrl(baseUrl)}/financial/invoices/new`);
  await page.waitForLoadState("domcontentloaded");

  const projectSelect = page.locator("select").first();
  await expect(projectSelect).toBeVisible({ timeout: 15_000 });
  const projectOptions = await projectSelect.locator("option").count();
  if (projectOptions <= 1) {
    return { ok: false, skipReason: "No project available to create an invoice." };
  }
  await projectSelect.selectOption({ index: 1 });

  const clientName = options?.clientName ?? `PW Invoice ${Date.now()}`;
  await page.getByPlaceholder("Client").fill(clientName);

  const descriptionInput = page.getByPlaceholder("Description").first();
  await expect(descriptionInput).toBeVisible();
  await descriptionInput.fill(options?.lineDescription ?? "Playwright invoice item");

  const createBtn = page.getByRole("button", { name: /Create draft invoice/i });
  await expect(createBtn).toBeEnabled();
  await createBtn.click();

  await expect(page).toHaveURL(/\/financial\/invoices\/.+/, { timeout: 20_000 });
  await expect(page.locator("body")).not.toContainText("Application error");
  return { ok: true };
}

/**
 * Desktop projects table: toggle first row status to a different value (Active / Pending / Closed).
 * Call after `setViewportSize` if you need the desktop table (not mobile list).
 */
export async function changeFirstProjectTableRowToDifferentStatus(page: Page, baseUrl: string): Promise<void> {
  await page.goto(`${trimBaseUrl(baseUrl)}/projects`);
  await page.waitForLoadState("domcontentloaded");

  const firstRow = page.locator("table tbody tr").first();
  await expect(firstRow).toBeVisible({ timeout: 15_000 });

  const statusBadge = firstRow.getByRole("button", { name: /^Status:/ }).first();
  await expect(statusBadge).toBeVisible({ timeout: 15_000 });
  const statusLabel = ((await statusBadge.textContent()) ?? "").trim().toLowerCase();
  const nextStatus = statusLabel.includes("active")
    ? "Pending"
    : statusLabel.includes("pending")
      ? "Closed"
      : "Active";

  await statusBadge.click();

  const statusSelect = firstRow.getByLabel("Change project status").first();
  await expect(statusSelect).toBeVisible();
  await statusSelect.selectOption(nextStatus);

  await expect(
    firstRow.getByRole("button", { name: new RegExp(`^Status: ${nextStatus}`, "i") }).first()
  ).toBeVisible({ timeout: 15_000 });
}
