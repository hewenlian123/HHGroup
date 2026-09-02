import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { addE2EOwnerSession, loginAsE2EOwner } from "./e2e-auth-owner";
import { loadE2EProcessEnv } from "./e2e-load-env";
import {
  assertE2EBaseUrlSafeForMutations,
  assertE2ESupabaseUrlSafeForMutations,
} from "./e2e-supabase-url-guard";

const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const RUN_ID = Date.now();
const WORKER_ID = randomUUID();
const PROJECT_ID = randomUUID();
const PAYMENT_ID = randomUUID();
const WORKER_NAME = `PW Worker Balances ${RUN_ID}`;
const PROJECT_NAME = `PW Worker Balances Project ${RUN_ID}`;
const FIXTURE_BALANCE = { pendingAmount: 125.55, paidAmount: 0, balance: 125.55 } as const;
const FIXTURE_LEDGER = [
  {
    amount: 125.55,
    vendor: "PW Pending Vendor",
    description: "PW pending reimbursement",
    reimbursementDate: "2026-09-01",
    status: "pending",
  },
  {
    amount: 75.2,
    vendor: "PW Paid Vendor",
    description: "PW paid reimbursement",
    reimbursementDate: "2026-08-31",
    status: "paid",
  },
] as const;

let admin: SupabaseClient | null = null;

function envClient(): SupabaseClient | null {
  loadE2EProcessEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  assertE2ESupabaseUrlSafeForMutations(url);
  assertE2EBaseUrlSafeForMutations(BASE, "financial workers global UI");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function cleanup(client: SupabaseClient) {
  for (const operation of [
    () => client.from("worker_reimbursements").delete().eq("worker_id", WORKER_ID),
    () => client.from("worker_payments").delete().eq("worker_id", WORKER_ID),
    () => client.from("labor_workers").delete().eq("id", WORKER_ID),
    () => client.from("workers").delete().eq("id", WORKER_ID),
    () => client.from("projects").delete().eq("id", PROJECT_ID),
  ]) {
    const result = await operation();
    expect(result.error).toBeNull();
  }
}

async function seed(client: SupabaseClient) {
  await cleanup(client);
  const project = await client
    .from("projects")
    .insert({ id: PROJECT_ID, name: PROJECT_NAME, status: "active", budget: 0, spent: 0 })
    .select("id")
    .single();
  expect(project.error).toBeNull();
  const worker = await client
    .from("workers")
    .insert({ id: WORKER_ID, name: WORKER_NAME, status: "active" })
    .select("id")
    .single();
  expect(worker.error).toBeNull();
  const laborWorker = await client
    .from("labor_workers")
    .upsert({ id: WORKER_ID, name: WORKER_NAME, active: true, rate: 0, type: "QA" })
    .select("id")
    .single();
  expect(laborWorker.error).toBeNull();
  const payment = await client
    .from("worker_payments")
    .insert({
      id: PAYMENT_ID,
      worker_id: WORKER_ID,
      total_amount: 75.2,
      payment_method: "E2E Cash",
      note: "PW financial workers UI fixture",
    })
    .select("id")
    .single();
  expect(payment.error).toBeNull();
  const reimbursements = await client.from("worker_reimbursements").insert([
    {
      worker_id: WORKER_ID,
      project_id: PROJECT_ID,
      amount: FIXTURE_LEDGER[0].amount,
      vendor: FIXTURE_LEDGER[0].vendor,
      description: FIXTURE_LEDGER[0].description,
      reimbursement_date: FIXTURE_LEDGER[0].reimbursementDate,
      status: FIXTURE_LEDGER[0].status,
    },
    {
      worker_id: WORKER_ID,
      project_id: PROJECT_ID,
      amount: FIXTURE_LEDGER[1].amount,
      vendor: FIXTURE_LEDGER[1].vendor,
      description: FIXTURE_LEDGER[1].description,
      reimbursement_date: FIXTURE_LEDGER[1].reimbursementDate,
      status: FIXTURE_LEDGER[1].status,
      payment_id: PAYMENT_ID,
    },
  ]);
  expect(reimbursements.error).toBeNull();
}

async function expectNoRootOverflow(page: Page, viewport: number) {
  expect(
    await page.locator("html").evaluate((node) => node.scrollWidth <= node.clientWidth),
    `${viewport}px viewport has no root horizontal overflow`
  ).toBe(true);
}

function durationIsAtMost(value: string, maximumMilliseconds: number) {
  return value.split(",").every((duration) => {
    const trimmed = duration.trim();
    const milliseconds = trimmed.endsWith("ms")
      ? Number.parseFloat(trimmed)
      : Number.parseFloat(trimmed) * 1_000;
    return Number.isFinite(milliseconds) && milliseconds <= maximumMilliseconds;
  });
}

test.describe("Financial worker balances global UI", () => {
  test.beforeAll(async () => {
    admin = envClient();
    if (admin) await seed(admin);
  });

  test.afterAll(async () => {
    if (admin) await cleanup(admin);
  });

  test("keeps the seeded balance ledger literal while its controls remain reachable", async ({
    page,
  }) => {
    test.skip(!admin, "Local Supabase service-role environment is required.");
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await loginAsE2EOwner(page, "/financial/workers");

    await expect(page.getByRole("heading", { name: "Worker Balances", exact: true })).toBeVisible();
    const balanceResponse = await page.request.get("/api/worker-reimbursements/balances");
    expect(balanceResponse.ok()).toBe(true);
    const balancePayload = (await balanceResponse.json()) as {
      balances: Array<{
        workerId: string;
        pendingAmount: number;
        paidAmount: number;
        balance: number;
      }>;
    };
    expect(balancePayload.balances.find((row) => row.workerId === WORKER_ID)).toMatchObject(
      FIXTURE_BALANCE
    );
    const desktopTable = page.locator('[data-neo-table="true"]').first();
    await expect(
      desktopTable.getByRole("columnheader", { name: "Worker", exact: true })
    ).toHaveClass(/text-left/);
    const desktopRow = desktopTable.locator("tbody tr").filter({ hasText: WORKER_NAME });
    await expect(desktopRow).toBeVisible();
    await expect(desktopRow.locator("td").nth(1)).toHaveText("$125.55");
    await expect(desktopRow.locator("td").nth(2)).toHaveText("$0.00");
    await expect(desktopRow.locator("td").nth(3)).toHaveText("$125.55");
    const contrast = await new AxeBuilder({ page })
      .include("main")
      .withRules(["color-contrast"])
      .analyze();
    expect(contrast.violations).toEqual([]);

    for (const viewport of [390, 820]) {
      await page.setViewportSize({ width: viewport, height: 844 });
      const scope =
        viewport === 390
          ? page
              .locator('[aria-label="Worker balances"] [data-neo-mobile-card="true"]')
              .filter({ hasText: WORKER_NAME })
          : desktopRow;
      const workerAction = scope.getByRole("button", { name: WORKER_NAME, exact: true });
      const ledgerAction = scope.getByRole("button", {
        name: viewport === 390 ? "View Ledger" : "Ledger",
        exact: true,
      });
      await expect(workerAction).toBeVisible();
      const workerBox = await workerAction.boundingBox();
      expect(workerBox?.height, `${viewport}px worker action height`).toBeGreaterThanOrEqual(44);
      expect(workerBox?.width, `${viewport}px worker action width`).toBeGreaterThanOrEqual(44);
      await expect(ledgerAction).toBeVisible();
      expect(
        (await ledgerAction.boundingBox())?.height,
        `${viewport}px ledger action height`
      ).toBeGreaterThanOrEqual(44);
      await expectNoRootOverflow(page, viewport);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .locator('[aria-label="Worker balances"] [data-neo-mobile-card="true"]')
      .filter({ hasText: WORKER_NAME })
      .getByRole("button", { name: "View Ledger", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expectNoRootOverflow(page, 390);
    const ledgerRows = dialog.locator("tbody tr");
    const pendingRow = ledgerRows.filter({ hasText: FIXTURE_LEDGER[0].vendor });
    const paidRow = ledgerRows.filter({ hasText: FIXTURE_LEDGER[1].vendor });
    await expect(pendingRow).toBeVisible();
    await expect(pendingRow.locator("td").nth(3)).toHaveText("$125.55");
    await expect(pendingRow.locator("td").nth(4)).toHaveText(FIXTURE_LEDGER[0].status);
    await expect(paidRow).toBeVisible();
    await expect(paidRow.locator("td").nth(3)).toHaveText("$75.20");
    await expect(paidRow.locator("td").nth(4)).toHaveText(FIXTURE_LEDGER[1].status);
    const ledgerResponse = await page.request.get(
      `/api/worker-reimbursements/ledger/${encodeURIComponent(WORKER_ID)}`
    );
    expect(ledgerResponse.ok()).toBe(true);
    const ledgerPayload = (await ledgerResponse.json()) as {
      reimbursements: Array<{ amount: number; status: string; vendor: string | null }>;
    };
    expect(ledgerPayload.reimbursements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          amount: FIXTURE_LEDGER[0].amount,
          status: FIXTURE_LEDGER[0].status,
          vendor: FIXTURE_LEDGER[0].vendor,
        }),
        expect.objectContaining({
          amount: FIXTURE_LEDGER[1].amount,
          status: FIXTURE_LEDGER[1].status,
          vendor: FIXTURE_LEDGER[1].vendor,
        }),
      ])
    );
    const dialogContrast = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .withRules(["color-contrast"])
      .analyze();
    expect(dialogContrast.violations).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();

    for (const viewport of [1180, 1280, 1440]) {
      await page.setViewportSize({ width: viewport, height: 900 });
      const denseWorkerAction = desktopTable.getByRole("button", {
        name: WORKER_NAME,
        exact: true,
      });
      const denseLedgerAction = desktopTable.getByRole("button", { name: "Ledger", exact: true });
      await expect(denseWorkerAction).toBeVisible();
      expect((await denseWorkerAction.boundingBox())?.height).toBeLessThanOrEqual(40);
      await expect(denseLedgerAction).toBeVisible();
      expect(
        (await denseLedgerAction.boundingBox())?.height,
        `${viewport}px ledger action height`
      ).toBeLessThanOrEqual(40);
      await expectNoRootOverflow(page, viewport);
    }
    expect(errors).toEqual([]);
  });

  test("keeps forced-colors focus and reduced-motion behavior within the HH motion contract", async ({
    page,
  }) => {
    test.skip(!admin, "Local Supabase service-role environment is required.");
    await loginAsE2EOwner(page, "/financial/workers");
    await page.setViewportSize({ width: 1440, height: 900 });
    const desktopTable = page.locator('[data-neo-table="true"]').first();
    const forcedWorkerAction = desktopTable.getByRole("button", {
      name: WORKER_NAME,
      exact: true,
    });
    const forcedLedgerAction = desktopTable.getByRole("button", { name: "Ledger", exact: true });
    await expect(forcedWorkerAction).toBeVisible();
    await expect(forcedLedgerAction).toBeVisible();
    await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
    expect(
      await page.evaluate(() => ({
        forcedColors: matchMedia("(forced-colors: active)").matches,
        reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
      }))
    ).toEqual({ forcedColors: true, reducedMotion: true });
    for (const control of [forcedWorkerAction, forcedLedgerAction]) {
      await control.focus();
      const focusState = await control.evaluate((element) => {
        const styles = getComputedStyle(element);
        return {
          focusVisible: element.matches(":focus-visible"),
          outlineStyle: styles.outlineStyle,
          outlineWidth: parseFloat(styles.outlineWidth),
        };
      });
      expect(focusState.focusVisible).toBe(true);
      expect(focusState.outlineStyle).not.toBe("none");
      expect(focusState.outlineWidth).toBeGreaterThan(0);
    }
    await expect(forcedLedgerAction).toBeVisible();
    await expectNoRootOverflow(page, 1440);
    const reducedMotionControl = await forcedLedgerAction.evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        animationDuration: styles.animationDuration,
        animationName: styles.animationName,
        transitionDuration: styles.transitionDuration,
        transitionProperty: styles.transitionProperty,
      };
    });
    expect(reducedMotionControl.animationName).toBe("none");
    expect(durationIsAtMost(reducedMotionControl.transitionDuration, 150)).toBe(true);
    expect(reducedMotionControl.transitionProperty).not.toContain("all");
    expect(
      reducedMotionControl.transitionProperty
        .split(",")
        .map((property) => property.trim())
        .every((property) =>
          ["background-color", "border-color", "color", "box-shadow", "opacity"].includes(property)
        )
    ).toBe(true);
    await forcedLedgerAction.click();
    const reducedMotionDialog = page.getByRole("dialog");
    await expect(reducedMotionDialog).toBeVisible();
    await expect(reducedMotionDialog).toHaveClass(
      /motion-reduce:md:data-\[state=open\]:animate-hh-modal-fade-in/
    );
    const reducedMotionDialogStyles = await reducedMotionDialog.evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        animationDuration: styles.animationDuration,
        animationName: styles.animationName,
        transform: styles.transform,
        transitionDuration: styles.transitionDuration,
        transitionProperty: styles.transitionProperty,
      };
    });
    const dialogMatrix = reducedMotionDialogStyles.transform
      .match(/^matrix\(([^)]+)\)$/)?.[1]
      .split(",")
      .map((value) => Number.parseFloat(value.trim()));
    expect(dialogMatrix).toHaveLength(6);
    expect(dialogMatrix?.slice(0, 4)).toEqual([1, 0, 0, 1]);
    expect(
      reducedMotionDialogStyles.animationName === "none" ||
        durationIsAtMost(reducedMotionDialogStyles.animationDuration, 150)
    ).toBe(true);
    if (!durationIsAtMost(reducedMotionDialogStyles.transitionDuration, 0)) {
      expect(reducedMotionDialogStyles.transitionProperty).not.toContain("all");
      expect(reducedMotionDialogStyles.transitionProperty).not.toContain("transform");
      expect(
        reducedMotionDialogStyles.transitionProperty
          .split(",")
          .map((property) => property.trim())
          .every((property) =>
            ["background-color", "border-color", "color", "box-shadow", "opacity"].includes(
              property
            )
          )
      ).toBe(true);
    }
    await page.keyboard.press("Escape");
  });

  test("keeps the balances loading state visible until a delayed response resolves", async ({
    page,
  }) => {
    test.skip(!admin, "Local Supabase service-role environment is required.");
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.route("**/api/worker-reimbursements/balances?*", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      await route.continue();
    });
    await addE2EOwnerSession(page.context(), BASE);
    await page.goto("/financial/workers", { waitUntil: "domcontentloaded" });
    const loadingTable = page.locator('[data-neo-table="true"]').first();
    await expect(loadingTable.getByText("Loading…", { exact: true })).toBeVisible();
    await expect(loadingTable.getByText("Loading…", { exact: true })).not.toBeVisible();
    await expect(loadingTable.locator("tbody tr").filter({ hasText: WORKER_NAME })).toBeVisible();
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test("renders a balances fetch failure as the canonical danger alert", async ({ page }) => {
    test.skip(!admin, "Local Supabase service-role environment is required.");
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.route("**/api/worker-reimbursements/balances?*", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: '{"message":"Fixture balance failure"}',
      });
    });
    await loginAsE2EOwner(page, "/financial/workers");
    await expect(page.getByRole("alert").filter({ hasText: "Fixture balance failure" })).toHaveText(
      "Fixture balance failure"
    );
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).not.toEqual([]);
    expect(consoleErrors.every((message) => /failed to load resource.*500/i.test(message))).toBe(
      true
    );
  });
});
