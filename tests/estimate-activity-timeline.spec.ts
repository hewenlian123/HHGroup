import { expect, test } from "./estimate-playwright-test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Request } from "@playwright/test";

import { addE2EOwnerSession, gotoWithE2EAuth } from "./e2e-auth-owner";
import { deleteLocalEstimateFixtureGraphs } from "./e2e-estimate-fixture-teardown";
import { assertEstimateCertificationLocalOnly } from "./e2e-supabase-url-guard";

const ACTOR_ID = "33333333-3333-4333-8333-333333333333";
const ACTOR_LABEL = "owner@example.com";

function localAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Local Supabase service role is required for this test.");
  assertEstimateCertificationLocalOnly({
    baseURL: process.env.E2E_BASE_URL?.trim() || "http://127.0.0.1:3001",
    supabaseUrl: url,
  });
  return createClient(url, key, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

function cleanupError(label: string, error: unknown): Error {
  const detail = error instanceof Error ? error.message : String(error);
  return new Error(`${label}: ${detail}`, { cause: error });
}

async function deleteFixtureRows(
  db: SupabaseClient,
  table: string,
  column: string,
  value: string
): Promise<void> {
  const { error } = await db.from(table).delete().eq(column, value);
  if (error) throw new Error(error.message);
}

async function assertFixtureRowsAbsent(
  db: SupabaseClient,
  table: string,
  column: string,
  values: readonly string[]
): Promise<void> {
  if (values.length === 0) return;
  const { data, error } = await db.from(table).select(column).in(column, values);
  if (error) throw new Error(error.message);
  if ((data ?? []).length > 0) {
    throw new Error(`${table} retained ${(data ?? []).length} fixture row(s).`);
  }
}

test("Estimate Activity is revision-aware, linked, read-only, and responsive", async ({ page }) => {
  test.setTimeout(180_000);
  const db = localAdmin();
  const suffix = Date.now();
  const estimateNumber = `EST-P3C-PW-${suffix}`;
  const invoiceNumber = `INV-P3C-PW-${suffix}`;
  const projectName = `P3C Activity Project ${suffix}`;
  let sourceId = "";
  let revisionId = "";
  let scheduleId = "";
  let invoiceId = "";
  let projectId = "";
  const fixtureRscInFlight = new Set<Request>();
  const fixtureRscFailures: string[] = [];
  const fixtureRscHttpErrors: string[] = [];

  try {
    const source = await db
      .from("estimates")
      .insert({
        number: estimateNumber,
        client: "Activity Customer",
        project: projectName,
        status: "Draft",
      })
      .select("id")
      .single();
    if (source.error || !source.data?.id) {
      throw new Error(source.error?.message ?? "Could not seed Estimate.");
    }
    sourceId = String(source.data.id);

    const meta = await db.from("estimate_meta").insert({
      estimate_id: sourceId,
      client_name: "Activity Customer",
      project_name: projectName,
      estimate_date: "2026-08-22",
      tax: 50,
      discount: 50,
    });
    if (meta.error) throw new Error(meta.error.message);
    const item = await db.from("estimate_items").insert({
      estimate_id: sourceId,
      cost_code: "010000",
      desc: "Activity fixture",
      qty: 2,
      unit: "EA",
      unit_cost: 500,
      markup_pct: 0,
      sort_order: 0,
    });
    if (item.error) throw new Error(item.error.message);
    const schedule = await db
      .from("estimate_payment_schedule_items")
      .insert({
        estimate_id: sourceId,
        title: "Deposit",
        description: "Tax-inclusive fixed amount",
        amount: 500,
        status: "draft",
        invoice_id: null,
        sort_order: 0,
      })
      .select("id")
      .single();
    if (schedule.error || !schedule.data?.id) {
      throw new Error(schedule.error?.message ?? "Could not seed schedule.");
    }
    scheduleId = String(schedule.data.id);

    const created = await db.rpc("record_estimate_created_activity", {
      p_estimate_id: sourceId,
      p_actor_user_id: ACTOR_ID,
      p_actor_label: ACTOR_LABEL,
      p_creation_method: "new",
      p_source_estimate_id: null,
    });
    if (created.error) throw new Error(created.error.message);
    for (const nextStatus of ["Sent", "Approved"]) {
      const transition = await db.rpc("transition_estimate_status_with_activity", {
        p_estimate_id: sourceId,
        p_next_status: nextStatus,
        p_actor_user_id: ACTOR_ID,
        p_actor_label: ACTOR_LABEL,
        p_related_record_id: null,
        p_related_record_type: null,
      });
      if (transition.error) throw new Error(transition.error.message);
    }

    const revision = await db.rpc("create_estimate_revision", {
      p_source_estimate_id: sourceId,
      p_actor_user_id: ACTOR_ID,
      p_actor_label: ACTOR_LABEL,
    });
    if (revision.error) throw new Error(revision.error.message);
    const revisionRow = Array.isArray(revision.data) ? revision.data[0] : revision.data;
    revisionId = String(revisionRow?.estimate_id ?? "");
    if (!revisionId) throw new Error("Revision RPC did not return a record.");

    const invoice = await db
      .from("invoices")
      .insert({
        invoice_no: invoiceNumber,
        client_name: "Activity Customer",
        issue_date: "2026-08-22",
        due_date: "2026-08-22",
        status: "Draft",
        tax_pct: 5,
        subtotal: 476.19,
        tax_amount: 23.81,
        total: 500,
        paid_total: 0,
        balance_due: 500,
      })
      .select("id")
      .single();
    if (invoice.error || !invoice.data?.id) {
      throw new Error(invoice.error?.message ?? "Could not seed Invoice.");
    }
    invoiceId = String(invoice.data.id);
    const linkInvoice = await db.rpc("link_estimate_milestone_invoice_with_activity", {
      p_estimate_id: sourceId,
      p_schedule_item_id: scheduleId,
      p_invoice_id: invoiceId,
      p_actor_user_id: ACTOR_ID,
      p_actor_label: ACTOR_LABEL,
    });
    if (linkInvoice.error) throw new Error(linkInvoice.error.message);

    const project = await db
      .from("projects")
      .insert({
        name: projectName,
        status: "active",
        budget: 1000,
        spent: 0,
        source_estimate_id: sourceId,
        snapshot_revenue: 1000,
        snapshot_budget_cost: 1000,
        snapshot_breakdown: { materials: 1000, labor: 0, vendor: 0, other: 0 },
      })
      .select("id")
      .single();
    if (project.error || !project.data?.id) {
      throw new Error(project.error?.message ?? "Could not seed Project.");
    }
    projectId = String(project.data.id);
    const convert = await db.rpc("transition_estimate_status_with_activity", {
      p_estimate_id: sourceId,
      p_next_status: "Converted",
      p_actor_user_id: ACTOR_ID,
      p_actor_label: ACTOR_LABEL,
      p_related_record_id: projectId,
      p_related_record_type: "project",
    });
    if (convert.error) throw new Error(convert.error.message);

    const fixtureRoutePaths = new Set([
      `/estimates/${sourceId}`,
      `/estimates/${revisionId}`,
      `/financial/invoices/${invoiceId}`,
      `/projects/${projectId}`,
    ]);
    const isFixtureRscRequest = (request: Request): boolean => {
      const url = new URL(request.url());
      const headers = request.headers();
      return (
        headers.rsc === "1" &&
        headers["next-router-prefetch"] === "1" &&
        fixtureRoutePaths.has(url.pathname)
      );
    };
    page.on("request", (request) => {
      if (isFixtureRscRequest(request)) fixtureRscInFlight.add(request);
    });
    page.on("requestfinished", (request) => {
      fixtureRscInFlight.delete(request);
    });
    page.on("requestfailed", (request) => {
      if (!fixtureRscInFlight.delete(request)) return;
      fixtureRscFailures.push(
        `${request.method()} ${request.url()}: ${request.failure()?.errorText}`
      );
    });
    page.on("response", (response) => {
      const request = response.request();
      if (fixtureRscInFlight.has(request) && response.status() >= 400) {
        fixtureRscHttpErrors.push(`${response.status()} ${request.method()} ${request.url()}`);
      }
    });

    await page.setViewportSize({ width: 1440, height: 1000 });
    const baseURL = process.env.E2E_BASE_URL?.trim() || "http://127.0.0.1:3001";
    await addE2EOwnerSession(page.context(), baseURL);
    const estimateWarmup = await page.request.get(`${baseURL}/estimates/${sourceId}`);
    expect(estimateWarmup.ok()).toBe(true);
    await gotoWithE2EAuth(page, `/estimates/${sourceId}`);

    await page.getByRole("button", { name: "Estimate actions" }).click();
    await page.getByRole("menuitem", { name: "Activity", exact: true }).click();
    const activitySheet = page.getByTestId("estimate-activity-sheet");
    await expect(activitySheet).toBeVisible();
    const timeline = activitySheet.getByTestId("estimate-activity-timeline");
    await expect(timeline).toBeVisible();
    await expect(timeline).toContainText("Activity");
    await expect(timeline).toContainText("Rev 0");
    await expect(timeline).toContainText("Estimate Created");
    await expect(timeline).toContainText("Marked as Sent");
    await expect(timeline).toContainText("Approved");
    await expect(timeline).toContainText("Revision Created");
    await expect(timeline).toContainText("Draft Invoice Created");
    await expect(timeline).toContainText("Converted to Project");
    await expect(timeline).toContainText(ACTOR_LABEL);
    await expect(timeline.getByRole("link", { name: "Open Rev 1" })).toHaveAttribute(
      "href",
      `/estimates/${revisionId}`
    );
    const invoiceLink = timeline.getByRole("link", { name: `Open ${invoiceNumber}` });
    await expect(invoiceLink).toHaveAttribute("href", `/financial/invoices/${invoiceId}`);
    await expect(timeline.getByRole("link", { name: "Open Project" })).toHaveAttribute(
      "href",
      `/projects/${projectId}`
    );
    await expect(timeline.locator("button, input, textarea, select")).toHaveCount(0);
    await expect.poll(() => fixtureRscInFlight.size, { timeout: 60_000 }).toBe(0);
    expect(fixtureRscFailures).toEqual([]);
    expect(fixtureRscHttpErrors).toEqual([]);
    await activitySheet.getByRole("button", { name: "Close", exact: true }).click();
    await expect(activitySheet).toHaveCount(0);
    await expect(timeline).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: "Activity" })).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(() => ({
          pointerEvents: document.body.style.pointerEvents,
          scrollLocked: document.body.hasAttribute("data-scroll-locked"),
        }))
      )
      .toEqual({ pointerEvents: "", scrollLocked: false });
    await expect.poll(() => fixtureRscInFlight.size, { timeout: 60_000 }).toBe(0);
    expect(fixtureRscFailures).toEqual([]);
    expect(fixtureRscHttpErrors).toEqual([]);

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileMoreActions = page.getByLabel("More estimate actions", { exact: true });
    await expect(mobileMoreActions).toBeVisible();
    await expect(mobileMoreActions).toBeEnabled();
    await mobileMoreActions.click({ trial: true });
    await mobileMoreActions.click();
    await page.getByRole("menuitem", { name: "Activity", exact: true }).click();
    await expect(timeline).toBeVisible();
    await expect(timeline).toContainText("Draft Invoice Created");
    await expect(timeline).toContainText("Converted to Project");

    const mobileInvoiceLink = timeline.getByRole("link", { name: `Open ${invoiceNumber}` });
    await mobileInvoiceLink.evaluate((link) => link.setAttribute("target", "_blank"));
    const context = page.context();
    const [invoicePage, invoiceResponse] = await Promise.all([
      context.waitForEvent("page", { timeout: 60_000 }),
      context.waitForEvent("response", {
        predicate: (response) =>
          response.request().method() === "GET" &&
          new URL(response.url()).pathname === `/api/invoices/${invoiceId}`,
        timeout: 60_000,
      }),
      mobileInvoiceLink.click(),
    ]);
    expect(invoiceResponse.status()).toBe(200);
    const invoicePayload = (await invoiceResponse.json()) as {
      invoice?: { id?: string; invoiceNo?: string };
      ok?: boolean;
    };
    expect(invoicePayload).toMatchObject({
      invoice: { id: invoiceId, invoiceNo: invoiceNumber },
      ok: true,
    });
    await invoicePage.waitForURL((url) => url.pathname === `/financial/invoices/${invoiceId}`, {
      timeout: 60_000,
    });
    expect(new URL(invoicePage.url()).pathname).toBe(`/financial/invoices/${invoiceId}`);
    const invoiceDetail = invoicePage.getByTestId("invoice-detail");
    await expect(invoiceDetail).toBeVisible();
    await expect(invoiceDetail.getByRole("heading", { name: invoiceNumber })).toBeVisible();
    await expect(invoicePage.getByTestId("invoice-detail-status")).toContainText("Draft");
    await invoicePage.close();

    await activitySheet.getByRole("button", { name: "Close", exact: true }).click();
    await expect(activitySheet).toHaveCount(0);
    await expect(timeline).toHaveCount(0);
    await expect.poll(() => fixtureRscInFlight.size, { timeout: 60_000 }).toBe(0);
    expect(fixtureRscFailures).toEqual([]);
    expect(fixtureRscHttpErrors).toEqual([]);
  } finally {
    const cleanupErrors: Error[] = [];
    const cleanupStep = async (label: string, action: () => Promise<void>): Promise<void> => {
      try {
        await action();
      } catch (error) {
        cleanupErrors.push(cleanupError(label, error));
      }
    };

    if (sourceId && /^https?:\/\//i.test(page.url())) {
      await cleanupStep("settle fixture-owned RSC prefetches before teardown", async () => {
        await expect
          .poll(() => fixtureRscInFlight.size, {
            message: "fixture-owned RSC prefetches must finish before leaving their source page",
            timeout: 60_000,
          })
          .toBe(0);
        expect(fixtureRscFailures).toEqual([]);
        expect(fixtureRscHttpErrors).toEqual([]);
      });
      await cleanupStep("leave fixture-owned page before teardown", async () => {
        await gotoWithE2EAuth(page, "/estimates/new");
        expect(new URL(page.url()).pathname).toBe("/estimates/new");
        await expect(page.getByTestId("estimate-new-header")).toContainText("New Estimate");
        await expect(page.getByTestId("estimate-activity-sheet")).toHaveCount(0);
        for (const href of [
          `/estimates/${sourceId}`,
          `/estimates/${revisionId}`,
          `/financial/invoices/${invoiceId}`,
          `/projects/${projectId}`,
        ]) {
          await expect(page.locator(`a[href="${href}"]`)).toHaveCount(0);
        }
        await expect.poll(() => fixtureRscInFlight.size).toBe(0);
        expect(fixtureRscFailures).toEqual([]);
        expect(fixtureRscHttpErrors).toEqual([]);
      });
      if (cleanupErrors.length > 0 && !page.isClosed()) {
        await cleanupStep("close fixture-owned page after failed teardown navigation", async () => {
          await page.close();
        });
      }
    }

    if (projectId) {
      await cleanupStep("delete project fixture", () =>
        deleteFixtureRows(db, "projects", "id", projectId)
      );
    }
    if (revisionId) {
      await cleanupStep("delete revision payment schedule", () =>
        deleteFixtureRows(db, "estimate_payment_schedule_items", "estimate_id", revisionId)
      );
    }
    if (sourceId) {
      await cleanupStep("delete source payment schedule", () =>
        deleteFixtureRows(db, "estimate_payment_schedule_items", "estimate_id", sourceId)
      );
    }
    if (invoiceId) {
      await cleanupStep("delete invoice fixture", () =>
        deleteFixtureRows(db, "invoices", "id", invoiceId)
      );
    }
    if (revisionId) {
      await cleanupStep("delete revision items", () =>
        deleteFixtureRows(db, "estimate_items", "estimate_id", revisionId)
      );
      await cleanupStep("delete revision categories", () =>
        deleteFixtureRows(db, "estimate_categories", "estimate_id", revisionId)
      );
      await cleanupStep("delete revision metadata", () =>
        deleteFixtureRows(db, "estimate_meta", "estimate_id", revisionId)
      );
    }
    if (sourceId) {
      await cleanupStep("delete source items", () =>
        deleteFixtureRows(db, "estimate_items", "estimate_id", sourceId)
      );
      await cleanupStep("delete source categories", () =>
        deleteFixtureRows(db, "estimate_categories", "estimate_id", sourceId)
      );
      await cleanupStep("delete source metadata", () =>
        deleteFixtureRows(db, "estimate_meta", "estimate_id", sourceId)
      );
    }
    const estimateIds = [revisionId, sourceId].filter(Boolean);
    await cleanupStep("delete Estimate fixture graphs", () =>
      deleteLocalEstimateFixtureGraphs(estimateIds)
    );

    await cleanupStep("verify invoice fixture cleanup", () =>
      assertFixtureRowsAbsent(db, "invoices", "id", [invoiceId].filter(Boolean))
    );
    await cleanupStep("verify project fixture cleanup", () =>
      assertFixtureRowsAbsent(db, "projects", "id", [projectId].filter(Boolean))
    );
    await cleanupStep("verify Estimate fixture cleanup", () =>
      assertFixtureRowsAbsent(db, "estimates", "id", estimateIds)
    );
    await cleanupStep("verify Estimate activity cleanup", () =>
      assertFixtureRowsAbsent(db, "estimate_activity_events", "estimate_id", estimateIds)
    );

    if (cleanupErrors.length === 1) throw cleanupErrors[0];
    if (cleanupErrors.length > 1) {
      throw new AggregateError(cleanupErrors, "Activity Timeline fixture teardown failed.");
    }
  }
});
