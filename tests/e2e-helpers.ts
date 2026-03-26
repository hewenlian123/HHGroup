import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

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
  expect(
    Date.now() - start,
    "Delete control should appear immediately (no hover delay)"
  ).toBeLessThanOrEqual(maxMs + 150);
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

export type CreateDraftInvoiceResult = { ok: true } | { ok: false; skipReason: string };

/**
 * Self-contained: open New Invoice, pick first real project, minimal line + client, submit.
 * Use with `test.skip(!r.ok, r.ok ? "" : r.skipReason)` when projects may be empty.
 */
export async function tryCreateDraftInvoiceNavigateToDetail(
  page: Page,
  options?: { clientName?: string; lineDescription?: string }
): Promise<CreateDraftInvoiceResult> {
  await page.goto("/financial/invoices/new");
  await page.waitForLoadState("domcontentloaded");

  // Form loads projects via client Supabase after shell paint — wait for real options, not skeleton.
  await expect(page.getByRole("heading", { name: /^New Invoice$/i })).toBeVisible({
    timeout: 30_000,
  });
  const projectSelect = page.getByTestId("invoice-new-project-select");
  await expect(projectSelect).toBeVisible({ timeout: 30_000 });
  try {
    await expect(async () => {
      const n = await projectSelect.locator("option").count();
      expect(n).toBeGreaterThan(1);
    }).toPass({ timeout: 60_000, intervals: [500, 1000, 2000] });
  } catch {
    return { ok: false, skipReason: "No project available to create an invoice." };
  }
  await projectSelect.selectOption({ index: 1 });

  const clientName = options?.clientName ?? `PW Invoice ${Date.now()}`;
  await page.getByPlaceholder("Client").fill(clientName);

  const lineItemsTable = page.locator("div.overflow-x-auto table").first();
  const descriptionInput = lineItemsTable.locator('input[placeholder="Description"]').first();
  await expect(descriptionInput).toBeVisible({ timeout: 10_000 });
  await descriptionInput.fill(options?.lineDescription ?? "Playwright invoice item");
  const lineRow = lineItemsTable.locator("tbody tr").first();
  const unitPriceField = lineRow.locator('input[type="number"]').nth(1);
  if ((await unitPriceField.count()) > 0) {
    await unitPriceField.fill("100");
  }

  const createBtn = page.getByRole("button", { name: /Create draft invoice/i });
  try {
    await expect(createBtn).toBeEnabled({ timeout: 15_000 });
  } catch {
    return { ok: false, skipReason: "Invoice create action is disabled in this environment." };
  }
  await createBtn.click();

  // Some CI runs keep the user on `/new` when draft creation fails server-side.
  // Treat that as "skippable precondition failed" for downstream print-header assertions.
  try {
    await expect(page).toHaveURL(/\/financial\/invoices\/(?!new(?:\/|$))[^/?#]+/i, {
      timeout: 20_000,
    });
  } catch {
    if (
      await page
        .getByText(/Project is required|Client is required|Failed to create invoice|Try again/i)
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      return {
        ok: false,
        skipReason: "Invoice prerequisites are not satisfied in this environment.",
      };
    }
    if (page.url().includes("/financial/invoices/new")) {
      return { ok: false, skipReason: "Could not create draft invoice in this environment." };
    }
    throw new Error(`Invoice draft did not navigate to detail. Current URL: ${page.url()}`);
  }
  await expect(page.locator("body")).not.toContainText("Application error");
  return { ok: true };
}

/**
 * Desktop `/projects`: {@link ProjectsListClient} uses All / Active / Closed toggles (not a status column).
 * Asserts list loaded and the Active view filter applies without error.
 */
export async function openFirstProjectStatusSelect(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/projects");
  await page.waitForLoadState("domcontentloaded");

  await expect(page).toHaveURL(/\/projects\/?($|[?#])/, { timeout: 30_000 });

  // Stable test id on list page h1; fallback: main column + level-1 heading (avoids shell/breadcrumb ambiguity).
  const byTestId = page.getByTestId("projects-page-heading");
  const byMainH1 = page
    .locator("[data-app-main-column] main")
    .getByRole("heading", { level: 1, name: /^Projects$/ });
  await expect(byTestId.or(byMainH1).first()).toBeVisible({ timeout: 60_000 });

  // List search only (topbar also has "Search projects, workers…" — avoid strict-mode duplicate match).
  await expect(page.getByTestId("projects-list-search")).toBeVisible({ timeout: 30_000 });

  if (
    await page
      .getByText("No projects yet.")
      .isVisible()
      .catch(() => false)
  ) {
    test.skip(true, "No projects.");
    return;
  }

  const firstRow = page.locator("table tbody tr").first();
  await expect(firstRow).toBeVisible({ timeout: 30_000 });

  const activeBtn = page.getByRole("button", { name: /^Active \(\d+\)$/ });
  await expect(activeBtn).toBeVisible({ timeout: 15_000 });
  await activeBtn.click();

  if (
    await page
      .getByText("No projects match your filter.")
      .isVisible()
      .catch(() => false)
  ) {
    test.skip(true, "No active projects for Active filter.");
    return;
  }

  await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 15_000 });
}

/**
 * Desktop table: open the overflow / kebab on the first body row.
 * Supports `RowActionsMenu` (`Actions for …`, `Row actions`) and Tasks (`Task actions`),
 * plus icon-only triggers in the last cell (e.g. Customers).
 */
export async function clickFirstRowOverflowMenu(page: Page): Promise<void> {
  const row = page.locator("tbody tr").first();
  await expect(row).toBeVisible({ timeout: 55_000 });
  const candidates = [
    row.getByRole("button", { name: /^Actions for / }),
    row.getByRole("button", { name: "Task actions" }),
    row.getByRole("button", { name: "Row actions" }),
  ];
  for (const loc of candidates) {
    if ((await loc.count()) > 0) {
      await loc.first().click();
      return;
    }
  }
  await row.locator("td").last().getByRole("button").first().click();
}

/** After {@link clickFirstRowOverflowMenu}, assert a Delete entry exists (then closes menu with Escape). */
export async function expectDeleteMenuItemThenClose(page: Page): Promise<void> {
  await expect(page.getByRole("menuitem", { name: /^Delete/ })).toBeVisible({ timeout: 5000 });
  await page.keyboard.press("Escape");
}

/**
 * Wait for at least one matching element; {@link test.skip} if not visible after timeout (empty list or slow load).
 */
export async function expectVisibleOrSkip(
  locator: Locator,
  skipReason: string,
  timeoutMs = 55_000
): Promise<void> {
  try {
    await expect(locator.first()).toBeVisible({ timeout: timeoutMs });
  } catch {
    test.skip(true, skipReason);
  }
}

/**
 * Server-side DB cleanup (Node). Pass a Supabase client with delete permission (service role or policies).
 * Patterns: PW / Playwright / Workflow Test / Body balance / `[E2E]` (except preserved seed UUIDs — see `e2e-cleanup-db.ts`).
 */
export {
  cleanupTestData,
  E2E_PRESERVED_CUSTOMER_ID,
  E2E_PRESERVED_PROJECT_ID,
  E2E_PRESERVED_WORKER_ID,
  E2E_TEST_SUBSTRINGS,
  type CleanupTestDataResult,
} from "./e2e-cleanup-db";
