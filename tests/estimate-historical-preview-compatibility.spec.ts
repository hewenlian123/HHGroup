import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { createEstimateWithItemsWithClient } from "@/lib/estimates-db";
import { loginAsE2EOwner } from "./e2e-auth-owner";
import { expectBoundedLetterPages } from "./estimate-document-page-integrity";
import { assertEstimateCertificationLocalOnly } from "./e2e-supabase-url-guard";

const EVIDENCE_DIR = "/private/tmp/hh-estimate-historical-compatibility";
const createdEstimateIds = new Set<string>();
const milestoneShapes = [
  {
    title: "Mobilization",
    description: "Due after site mobilization and layout confirmation.",
    amount: 22_827.22,
  },
  {
    title: "Permit procurement",
    description: "Due after permit procurement, protection, and demolition are complete.",
    amount: 91_308.86,
  },
  {
    title: "Sitework completion",
    description: "Due after underground and sitework inspection.",
    amount: 68_481.65,
  },
  {
    title: "Foundation and structural progress",
    description: "Due after concrete, framing, and structural inspection approval.",
    amount: 91_308.86,
  },
  {
    title: "Exterior enclosure, windows, and rough systems completion",
    description:
      "Due after weather enclosure and coordinated rough mechanical, electrical, and plumbing inspections are complete and documented.",
    amount: 91_308.86,
  },
  {
    title: "Interior finish progress",
    description:
      "Due after drywall, cabinetry, tile, paint, finish carpentry, and fixture installation reach the agreed progress point.",
    amount: 68_481.65,
  },
  {
    title: "Final completion and client turnover",
    description:
      "Due after final inspections, punch completion, closeout documentation, owner orientation, and accepted project turnover.",
    amount: 22_827.22,
  },
];

function localAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Local Supabase admin configuration is required.");
  assertEstimateCertificationLocalOnly({
    baseURL: process.env.E2E_BASE_URL,
    supabaseUrl: url,
    databaseUrl: process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL,
  });
  return createClient(url, key, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

function fitText(seed: string, length: number): string {
  const source = `${seed.trim()} `;
  return source.repeat(Math.ceil(length / source.length) + 1).slice(0, length);
}

function fixtureItems() {
  const itemLengths = [285, 423, 307, 419, 360, 252, 283, 180, 300, 259, 426, 248];
  const sortOrders = [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12];
  return itemLengths.map((targetLength, index) => {
    const title = `Historical scope item ${String(index + 1).padStart(2, "0")}`;
    const bodyLength = Math.max(80, targetLength - title.length - 120);
    const raw = `${title}\n<p>${fitText(
      "Provide coordinated construction labor, material, field verification, protection, inspection, and closeout",
      bodyLength
    )}.</p><ul><li>Confirm existing conditions.</li><li>Coordinate adjacent work.</li><li>Document completion.</li></ul>`;
    return {
      costCode: "010000",
      desc: raw,
      qty: 1,
      unit: "EA",
      unitCost: index === itemLengths.length - 1 ? 436_000 : 0,
      markupPct: 0,
      hideAmountOnPdf: index % 3 !== 2,
      status: "included" as const,
      sortOrder: sortOrders[index],
    };
  });
}

function fixtureMilestones() {
  return milestoneShapes.map((shape) => ({
    title: shape.title,
    description: shape.description,
    amount: shape.amount,
    dueDate: null,
  }));
}

async function cleanupEstimateGraph(estimateId: string): Promise<void> {
  const admin = localAdmin();
  await admin.from("estimate_payment_schedule_items").delete().eq("estimate_id", estimateId);
  await admin.from("estimate_items").delete().eq("estimate_id", estimateId);
  await admin.from("estimate_categories").delete().eq("estimate_id", estimateId);
  await admin.from("estimate_meta").delete().eq("estimate_id", estimateId);
  await admin.from("estimates").delete().eq("id", estimateId);
}

async function seedHistoricalFixture(): Promise<string> {
  const admin = localAdmin();
  const estimateId = randomUUID();
  createdEstimateIds.add(estimateId);
  const today = new Date().toISOString().slice(0, 10);
  const items = fixtureItems();
  const milestones = fixtureMilestones();

  expect(
    (
      await admin.from("estimates").insert({
        id: estimateId,
        number: `HIST-COMPAT-${Date.now()}`,
        client: "[E2E] Historical Compatibility Customer",
        project: "[E2E] Historical Compatibility Project",
        status: "Draft",
        updated_at: today,
        customer_id: null,
      })
    ).error
  ).toBeNull();
  expect(
    (
      await admin.from("estimate_meta").insert({
        estimate_id: estimateId,
        client_name: "[E2E] Historical Compatibility Customer",
        client_phone: "",
        client_email: "",
        client_address: "100 Local Compatibility Way",
        project_name: "[E2E] Historical Compatibility Project",
        project_site_address: "100 Local Compatibility Way",
        cost_category_names: {},
        tax: 20_544.32,
        discount: 0,
        overhead_pct: 0,
        profit_pct: 0,
        estimate_date: today,
        valid_until: null,
        notes: null,
        sales_person: null,
        document_notes: [],
      })
    ).error
  ).toBeNull();
  expect(
    (
      await admin.from("estimate_categories").insert([
        {
          estimate_id: estimateId,
          cost_code: "010000",
          display_name: "General Requirements",
          order_index: 0,
        },
        {
          estimate_id: estimateId,
          cost_code: "020000",
          display_name: "Historical Empty Section A",
          order_index: 1,
        },
        {
          estimate_id: estimateId,
          cost_code: "030000",
          display_name: "Historical Empty Section B",
          order_index: 2,
        },
      ])
    ).error
  ).toBeNull();
  expect(
    (
      await admin.from("estimate_items").insert(
        items.map((item) => ({
          estimate_id: estimateId,
          cost_code: item.costCode,
          desc: item.desc,
          qty: item.qty,
          unit: item.unit,
          unit_cost: item.unitCost,
          markup_pct: 0,
          hide_amount_on_pdf: item.hideAmountOnPdf,
          status: item.status,
          sort_order: item.sortOrder,
        }))
      )
    ).error
  ).toBeNull();
  expect(
    (
      await admin.from("estimate_payment_schedule_items").insert(
        milestones.map((milestone, index) => ({
          estimate_id: estimateId,
          sort_order: index,
          title: milestone.title,
          description: milestone.description,
          amount: milestone.amount,
          due_date: null,
          status: "draft",
          invoice_id: null,
        }))
      )
    ).error
  ).toBeNull();
  return estimateId;
}

async function seedCurrentFixture(): Promise<string> {
  const estimateId = await createEstimateWithItemsWithClient(localAdmin(), {
    clientName: "[E2E] Current Compatibility Customer",
    projectName: "[E2E] Current Compatibility Project",
    address: "100 Local Compatibility Way",
    estimateDate: new Date().toISOString().slice(0, 10),
    validUntil: "",
    notes: "",
    documentNotes: [],
    salesPerson: "Local QA",
    documentStyle: "proposal",
    tax: 20_544.32,
    discount: 0,
    overheadPct: 0,
    profitPct: 0,
    categoryNames: { "010000": "General Requirements" },
    items: fixtureItems(),
    paymentSchedule: fixtureMilestones(),
  });
  createdEstimateIds.add(estimateId);
  return estimateId;
}

async function financialSnapshot(estimateId: string) {
  const admin = localAdmin();
  const [meta, items, milestones] = await Promise.all([
    admin.from("estimate_meta").select("tax, discount").eq("estimate_id", estimateId).single(),
    admin
      .from("estimate_items")
      .select("sort_order, qty, unit_cost")
      .eq("estimate_id", estimateId)
      .order("sort_order"),
    admin
      .from("estimate_payment_schedule_items")
      .select("sort_order, amount, status, invoice_id")
      .eq("estimate_id", estimateId)
      .order("sort_order"),
  ]);
  expect(meta.error).toBeNull();
  expect(items.error).toBeNull();
  expect(milestones.error).toBeNull();
  return {
    meta: meta.data,
    items: items.data,
    milestones: milestones.data,
  };
}

async function expectCanonicalPreview(page: Page, estimateId: string): Promise<number> {
  await page.goto(`/estimates/${estimateId}/preview`, { waitUntil: "domcontentloaded" });
  const document = page.getByTestId("estimate-document");
  await expect(document).toBeVisible({ timeout: 60_000 });
  await expect(document).toHaveAttribute("data-estimate-document-style", "proposal");
  await expect(document.getByTestId("estimate-line-item-output")).toHaveCount(12);
  await expect(document.locator(".estimate-payment-row")).toHaveCount(7);
  await expect(document.locator('[data-final-packet-part^="payment"]')).toHaveCount(1);
  await expect(document.getByTestId("estimate-preview-summary")).toContainText("$436,000.00");
  await expect(document.getByTestId("estimate-preview-summary")).toContainText("$20,544.32");
  await expect(document.getByTestId("estimate-preview-summary")).toContainText("$456,544.32");

  const emptyScopeSections = document.locator(
    '.estimate-scope-section:not(:has([data-testid="estimate-line-item-output"]))'
  );
  await expect(emptyScopeSections).toHaveCount(0);

  const pages = document.getByTestId("estimate-preview-page");
  await expect.poll(() => pages.count()).toBeGreaterThan(1);
  await expectBoundedLetterPages(pages);
  return pages.count();
}

test.afterAll(async () => {
  for (const estimateId of createdEstimateIds) await cleanupEstimateGraph(estimateId);
});

test("historical and current Estimate shapes share one bounded Preview, Print, and PDF pipeline", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await mkdir(EVIDENCE_DIR, { recursive: true });
  const historicalId = await seedHistoricalFixture();
  const currentId = await seedCurrentFixture();
  const beforeHistorical = await financialSnapshot(historicalId);
  const beforeCurrent = await financialSnapshot(currentId);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAsE2EOwner(page, `/estimates/${historicalId}/preview`);
  const historicalPageCount = await expectCanonicalPreview(page, historicalId);
  const currentPageCount = await expectCanonicalPreview(page, currentId);
  expect(historicalPageCount).toBe(currentPageCount);

  for (const fixture of [
    { id: historicalId, label: "historical" },
    { id: currentId, label: "current" },
  ]) {
    await page.goto(`/estimates/${fixture.id}/print`, { waitUntil: "domcontentloaded" });
    const printPages = page.getByTestId("estimate-preview-page");
    await expect(printPages).toHaveCount(historicalPageCount);
    await expectBoundedLetterPages(printPages);

    const pdfResponse = await page.request.get(`/api/estimates/${fixture.id}/pdf`);
    expect(pdfResponse.status()).toBe(200);
    const pdf = await pdfResponse.body();
    expect(pdf.subarray(0, 4).toString("utf8")).toBe("%PDF");
    expect(pdf.toString("latin1").match(/\/Type\s*\/Page\b/g)?.length ?? 0).toBe(
      historicalPageCount
    );
    await writeFile(join(EVIDENCE_DIR, `${fixture.label}.pdf`), pdf);
  }

  const viewports = [
    { name: "desktop-1440", width: 1440, height: 1000 },
    { name: "desktop-1280", width: 1280, height: 900 },
    { name: "ipad-landscape", width: 1180, height: 820 },
    { name: "ipad-portrait", width: 820, height: 1180 },
    { name: "mobile-390", width: 390, height: 844 },
  ];
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(`/estimates/${historicalId}/preview`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("estimate-preview-page")).toHaveCount(historicalPageCount);
    const rootOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(rootOverflow).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: join(EVIDENCE_DIR, `${viewport.name}.png`),
      fullPage: false,
    });
  }

  expect(await financialSnapshot(historicalId)).toEqual(beforeHistorical);
  expect(await financialSnapshot(currentId)).toEqual(beforeCurrent);
});
