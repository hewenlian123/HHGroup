import { writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test, type Page } from "./estimate-playwright-test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { gotoWithE2EAuth, loginAsE2EOwner, reloadWithE2EAuth } from "./e2e-auth-owner";
import { deleteLocalEstimateFixtureGraphs } from "./e2e-estimate-fixture-teardown";
import { assertEstimateCertificationLocalOnly } from "./e2e-supabase-url-guard";

type ScopeItem = {
  title: string;
  description: string;
  qty: number;
  unitPrice: number;
};

type ScopeSection = {
  title: string;
  items: ScopeItem[];
};

type CertificationMetrics = {
  clicks: number;
  keyboardInteractions: number;
  scrolls: number;
  focusLosses: number;
  unnecessaryDialogs: number;
  routeTransitions: number;
  saveSearches: number;
  templateCreateMs?: number;
  templateApplyMs?: number;
  firstSaveFailureFeedbackMs?: number;
  firstSaveRetryMs?: number;
  reloadMs?: number;
  editSaveMs?: number;
  previewOpenMs?: number;
  previewFitMs?: number;
  printOpenMs?: number;
  pdfMs?: number;
  repeatedPdfMs?: number;
  largeDetailMs?: number;
  largeEditSaveMs?: number;
  largePreviewMs?: number;
  largePdfMs?: number;
  largeTransferBytes?: number;
  largeDomNodes?: number;
  largeHeapBytes?: number | null;
  responsiveMs?: Record<string, number>;
};

const suffix = Date.now();
const marker = `LOCAL CERT OWNER REVIEW ${suffix}`;
const templateName = `${marker} Master Template`;
const duplicateTemplateName = `${templateName} copy`;
const customerName = "[E2E] Test Customer";
const seedProjectName = "[E2E] Seed — HH Unified";
const metrics: CertificationMetrics = {
  clicks: 0,
  keyboardInteractions: 0,
  scrolls: 0,
  focusLosses: 0,
  unnecessaryDialogs: 0,
  routeTransitions: 0,
  saveSearches: 0,
  responsiveMs: {},
};

let estimateId = "";
let estimateNumber = "";
let revisionId = "";
let convertedProjectId = "";
let milestoneInvoiceId = "";
let expectedPersistedSectionOrder: string[] = [];

const sections: ScopeSection[] = [
  {
    title: "Site Logistics & Preconstruction",
    items: [
      {
        title: "Mobilization and site setup",
        description:
          "Mobilize supervision, temporary facilities, safety signage, and startup coordination for the occupied residence.",
        qty: 1,
        unitPrice: 3500,
      },
      {
        title: "Survey and construction layout",
        description:
          "Provide field layout for building lines, control points, openings, and critical elevations before work begins.",
        qty: 24,
        unitPrice: 145,
      },
      {
        title: "Temporary fencing and access control",
        description:
          "Install and maintain approximately 180.5 linear feet of temporary fencing, gates, and controlled access.",
        qty: 180.5,
        unitPrice: 24.5,
      },
      {
        title: "Protection of occupied areas",
        description:
          "Install floor protection, dust barriers, negative-air separation, and daily protection checks.",
        qty: 1,
        unitPrice: 1200,
      },
      {
        title: "Permit coordination allowance",
        description:
          "Zero-value coordination placeholder; government fees and third-party professional fees remain excluded.",
        qty: 0,
        unitPrice: 500,
      },
    ],
  },
  {
    title: "Selective Demolition",
    items: [
      {
        title: "Interior selective demolition",
        description:
          "Remove designated non-structural partitions, finishes, fixtures, and cabinetry while protecting retained work.",
        qty: 1250,
        unitPrice: 6.25,
      },
      {
        title: "Debris hauling and disposal",
        description:
          "Load, haul, and legally dispose of demolition debris in approximately six roll-off container loads.",
        qty: 6,
        unitPrice: 950,
      },
      {
        title: "Concrete sawcutting",
        description:
          "Sawcut concrete for new underground routing and clean edges for patch-back installation.",
        qty: 120,
        unitPrice: 35,
      },
      {
        title: "Hazardous material allowance",
        description:
          "Owner-facing allowance for controlled handling if suspect material is confirmed by independent testing.",
        qty: 1,
        unitPrice: 7500,
      },
      {
        title: "Selective salvage labor",
        description:
          "Carefully remove and label owner-selected reusable doors, hardware, and finish components.",
        qty: 16,
        unitPrice: 85,
      },
    ],
  },
  {
    title: "Foundation & Concrete",
    items: [
      {
        title: "Excavation and subgrade preparation",
        description:
          "Excavate footing zones, condition subgrade, and maintain safe access for foundation operations.",
        qty: 3,
        unitPrice: 4500,
      },
      {
        title: "Footing concrete",
        description:
          "Place approximately 42.5 cubic yards of footing and grade-beam concrete per structural documents.",
        qty: 42.5,
        unitPrice: 320,
      },
      {
        title: "Reinforcing steel",
        description:
          "Furnish, fabricate, and install reinforcing steel, chairs, dowels, and required lap splices.",
        qty: 8200,
        unitPrice: 1.65,
      },
      {
        title: "Concrete slab placement",
        description:
          "Prepare vapor barrier and place, finish, cure, and protect approximately 2,400 square feet of slab.",
        qty: 2400,
        unitPrice: 12.5,
      },
      {
        title: "Concrete pump and placement equipment",
        description:
          "Provide pump truck, placement crew support, washout control, and normal mobilization.",
        qty: 1,
        unitPrice: 3500,
      },
    ],
  },
  {
    title: "Structural Framing",
    items: [
      {
        title: "Structural lumber package",
        description:
          "Furnish engineered and dimensional lumber package based on current structural drawings and takeoff.",
        qty: 1,
        unitPrice: 125000,
      },
      {
        title: "Exterior and interior framing labor",
        description:
          "Frame exterior walls, interior partitions, beams, blocking, backing, and coordinated openings.",
        qty: 2400,
        unitPrice: 28,
      },
      {
        title: "Roof truss package",
        description:
          "Furnish and set prefabricated roof trusses including standard bracing and crane coordination.",
        qty: 1,
        unitPrice: 28000,
      },
      {
        title: "Wall and roof sheathing",
        description:
          "Install structural sheathing panels, fastening, clips, and required edge blocking.",
        qty: 245,
        unitPrice: 78.5,
      },
      {
        title: "Framing equipment rental",
        description:
          "Provide telehandler and lift equipment for framing operations with normal fuel and delivery.",
        qty: 14,
        unitPrice: 850,
      },
    ],
  },
  {
    title: "Building Envelope",
    items: [
      {
        title: "Roofing system",
        description:
          "Install underlayment, flashings, roof covering, penetrations, and standard manufacturer accessories.",
        qty: 2400,
        unitPrice: 18,
      },
      {
        title: "Window package and installation",
        description:
          "Furnish and install eighteen energy-efficient windows with flashing and perimeter sealant.",
        qty: 18,
        unitPrice: 2250,
      },
      {
        title: "Exterior door assemblies",
        description:
          "Furnish and install exterior door assemblies, weather seals, lock preparation, and threshold flashing.",
        qty: 4,
        unitPrice: 3800,
      },
      {
        title: "Weather-resistive barrier",
        description:
          "Install integrated weather-resistive barrier, tapes, transitions, and opening preparation.",
        qty: 2400,
        unitPrice: 4.75,
      },
      {
        title: "Exterior stucco finish",
        description:
          "Install lath, accessories, base coats, and integral-color finish coat at exterior wall areas.",
        qty: 2400,
        unitPrice: 16,
      },
    ],
  },
  {
    title: "Interior Finishes & Closeout",
    items: [
      {
        title: "Drywall and level-five finish",
        description:
          "Hang gypsum board and provide level-five finish in designated premium interior areas.",
        qty: 2400,
        unitPrice: 9.5,
      },
      {
        title: "Interior paint system",
        description:
          "Prime and apply two finish coats to prepared walls, ceilings, trim, and specified doors.",
        qty: 2400,
        unitPrice: 6.25,
      },
      {
        title: "Engineered flooring installation",
        description:
          "Install owner-approved engineered flooring, underlayment, transitions, and standard trim.",
        qty: 1800,
        unitPrice: 14.75,
      },
      {
        title: "Custom cabinet allowance",
        description:
          "Allowance for fabrication and installation of custom kitchen and bath cabinetry; final amount by selection.",
        qty: 1,
        unitPrice: 48000,
      },
      {
        title: "Final cleaning and turnover",
        description:
          "Complete construction cleaning, touch-up coordination, basic owner orientation, and turnover package.",
        qty: 1,
        unitPrice: 5200,
      },
    ],
  },
];

const templateSubtotal = sections
  .flatMap((section) => section.items)
  .reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
const createdSubtotal = templateSubtotal + 250;
const expectedTax = Math.round((createdSubtotal * 0.04712 + Number.EPSILON) * 100) / 100;
const expectedDiscount = 10000;
const createdTotal = createdSubtotal + expectedTax - expectedDiscount;
const modifiedSubtotal = createdSubtotal + 50;
const expectedTotal = modifiedSubtotal + expectedTax - expectedDiscount;

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

async function cleanupTemplates(): Promise<void> {
  const admin = localAdmin();
  const { error: deleteError } = await admin
    .from("estimate_templates")
    .delete()
    .in("name", [templateName, duplicateTemplateName]);
  if (deleteError) throw new Error(`Estimate template cleanup failed: ${deleteError.message}`);

  const { data: remaining, error: verifyError } = await admin
    .from("estimate_templates")
    .select("id")
    .in("name", [templateName, duplicateTemplateName]);
  if (verifyError)
    throw new Error(`Estimate template cleanup verification failed: ${verifyError.message}`);
  if (remaining?.length)
    throw new Error(`Estimate template cleanup left ${remaining.length} row(s)`);
}

async function cleanupEstimateGraph(id: string): Promise<void> {
  await deleteLocalEstimateFixtureGraphs([id]);
}

async function click(page: Page, locator: ReturnType<Page["locator"]>): Promise<void> {
  metrics.clicks += 1;
  await locator.click({ timeout: 30_000 });
}

async function lineItemCardByTitle(
  page: Page,
  title: string
): Promise<ReturnType<Page["locator"]>> {
  const rows = page.locator("[data-estimate-line-item-id]:visible");
  await expect
    .poll(() =>
      rows.evaluateAll(
        (lineItems, expectedTitle) =>
          lineItems.filter(
            (lineItem) =>
              lineItem.querySelector<HTMLInputElement>('input[aria-label$=" title"]')?.value ===
              expectedTitle
          ).length,
        title
      )
    )
    .toBe(1);
  const rowIndex = await rows.evaluateAll(
    (lineItems, expectedTitle) =>
      lineItems.findIndex(
        (lineItem) =>
          lineItem.querySelector<HTMLInputElement>('input[aria-label$=" title"]')?.value ===
          expectedTitle
      ),
    title
  );
  expect(rowIndex).toBeGreaterThanOrEqual(0);
  return rows.nth(rowIndex);
}

async function fillTemplateScope(page: Page): Promise<void> {
  const dialog = page.getByTestId("estimate-template-dialog");
  let lineIndex = 0;
  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
    if (sectionIndex > 0) {
      await click(page, dialog.getByRole("button", { name: "Add Section", exact: true }));
    }
    const section = sections[sectionIndex];
    await dialog.getByLabel(`Template section ${sectionIndex + 1} title`).fill(section.title);
    metrics.keyboardInteractions += 1;
    for (let itemIndex = 0; itemIndex < section.items.length; itemIndex += 1) {
      if (itemIndex > 0) {
        await click(page, dialog.getByRole("button", { name: "Add line" }).nth(sectionIndex));
      }
      lineIndex += 1;
      const item = section.items[itemIndex];
      await dialog.getByLabel(`Template item ${lineIndex} title`).fill(item.title);
      await dialog.getByLabel(`Template item ${lineIndex} quantity`).fill(String(item.qty));
      await dialog.getByLabel(`Template item ${lineIndex} unit price`).fill(String(item.unitPrice));
      await dialog.getByRole("button", { name: `Template item ${lineIndex} description` }).click();
      await dialog
        .getByRole("textbox", { name: `Template item ${lineIndex} description` })
        .fill(item.description);
      await dialog.getByTestId("estimate-description-done").click();
      metrics.keyboardInteractions += 4;
    }
  }
}

async function addNote(page: Page, type: string, body: string): Promise<void> {
  await click(page, page.getByRole("button", { name: "Add note" }));
  await click(page, page.getByRole("menuitem", { name: type }));
  const noteBody = page.getByLabel(`${type} body`).last();
  await noteBody.fill(body);
  metrics.keyboardInteractions += 1;
}

async function addMilestone(
  page: Page,
  params: {
    title: string;
    description: string;
    dueDate: string;
    percent?: string;
    amount?: string;
  }
): Promise<void> {
  await click(page, page.getByRole("button", { name: "Schedule Payment" }));
  const sheet = page.getByRole("dialog", { name: "Schedule Payment" });
  await expect(sheet).toBeVisible();
  await sheet.getByLabel("Payment Name").fill(params.title);
  if (params.percent) await sheet.getByLabel("% of estimate").fill(params.percent);
  if (params.amount) await sheet.getByLabel("Amount").fill(params.amount);
  await sheet.getByLabel("Description", { exact: true }).fill(params.description);
  await sheet.getByLabel("Due Date").fill(params.dueDate);
  metrics.keyboardInteractions += 4;
  await click(page, sheet.getByRole("button", { name: "Save", exact: true }));
  await expect(sheet).toBeHidden();
}

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe.serial("Estimate operational certification", () => {
  test.beforeAll(async () => {
    await cleanupTemplates();
  });

  test.afterAll(async () => {
    await cleanupTemplates();
    const admin = localAdmin();
    if (milestoneInvoiceId) {
      await admin
        .from("estimate_payment_schedule_items")
        .update({ invoice_id: null, status: "draft" })
        .eq("invoice_id", milestoneInvoiceId);
      await admin.from("invoice_items").delete().eq("invoice_id", milestoneInvoiceId);
      await admin.from("invoices").delete().eq("id", milestoneInvoiceId);
    }
    if (convertedProjectId) {
      await admin.from("projects").delete().eq("id", convertedProjectId);
    }
    if (revisionId) await cleanupEstimateGraph(revisionId);
    if (estimateId) await cleanupEstimateGraph(estimateId);
    await writeFile(
      join(tmpdir(), "hh-estimate-operational-certification.json"),
      JSON.stringify(
        {
          marker,
          estimateId,
          estimateNumber,
          templateSubtotal,
          createdSubtotal,
          createdTotal,
          modifiedSubtotal,
          expectedTax,
          expectedDiscount,
          expectedTotal,
          metrics,
        },
        null,
        2
      )
    );
  });

  test("creates, edits, duplicates, applies, and removes a realistic template", async ({
    page,
  }) => {
    test.setTimeout(360_000);
    await loginAsE2EOwner(page, "/estimate-templates");
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        const location = message.location();
        consoleErrors.push(`${message.text()} @ ${location.url || "unknown"}`);
      }
    });

    const started = performance.now();
    await click(page, page.getByTestId("estimate-template-create"));
    const dialog = page.getByTestId("estimate-template-dialog");
    await dialog.getByTestId("estimate-template-name").fill(templateName);
    await dialog
      .getByPlaceholder("Reusable scope for recurring estimate types…")
      .fill("Luxury residential renovation master scope with realistic construction pricing.");
    await dialog.getByLabel("Category").fill("Design-Build Renovation");
    await dialog.getByLabel("Default Tax Rate").fill("4.712");
    await dialog
      .getByLabel("Default Terms")
      .fill(
        "Standard progress billing. Work outside the listed scope requires written approval.\n标准进度付款；清单外工作须书面批准。"
      );
    metrics.keyboardInteractions += 5;
    await fillTemplateScope(page);

    await click(page, dialog.getByRole("button", { name: "Collapse section" }).first());
    await expect(dialog.getByRole("button", { name: "Expand section" }).first()).toBeVisible();
    await click(page, dialog.getByRole("button", { name: "Expand section" }).first());

    await click(page, dialog.getByRole("button", { name: "Add line" }).last());
    await dialog.getByLabel("Template item 31 title").fill("Temporary delete verification");
    await click(page, dialog.getByLabel("Remove Temporary delete verification"));
    await expect(dialog.getByLabel("Template item 31 title")).toHaveCount(0);

    await click(page, dialog.getByRole("button", { name: "Add Section", exact: true }));
    await dialog.getByLabel("Template section 7 title").fill("Temporary Section");
    await click(page, dialog.getByLabel("Remove Temporary Section"));
    await expect(dialog.getByLabel("Template section 7 title")).toHaveCount(0);

    await click(page, page.getByTestId("estimate-template-save"));
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    await expect(
      page.getByTestId("estimate-template-row").filter({ hasText: templateName }).first()
    ).toContainText("6 sections · 30 items", { timeout: 30_000 });
    metrics.templateCreateMs = Math.round(performance.now() - started);

    const search = page.getByTestId("estimate-template-search");
    await search.fill(templateName);
    await expect(page.getByTestId("estimate-template-row")).toHaveCount(1);
    await search.fill("No matching certification template");
    await expect(page.getByText("No matching templates.", { exact: true })).toBeVisible();
    await search.fill(templateName);

    const row = page.getByTestId("estimate-template-row").filter({ hasText: templateName }).first();
    await click(page, row.getByRole("button", { name: `Actions for ${templateName}` }));
    await click(page, page.getByRole("menuitem", { name: "Edit" }));
    await expect(dialog).toBeVisible();
    await dialog
      .getByPlaceholder("Reusable scope for recurring estimate types…")
      .fill("Edited luxury residential renovation master scope.");
    await click(page, page.getByTestId("estimate-template-save"));
    await expect(dialog).toBeHidden();

    await click(page, row.getByRole("button", { name: `Actions for ${templateName}` }));
    await click(page, page.getByRole("menuitem", { name: "Duplicate" }));
    const duplicate = page
      .getByTestId("estimate-template-row")
      .filter({ hasText: duplicateTemplateName })
      .first();
    await expect(duplicate).toBeVisible({ timeout: 30_000 });
    await click(
      page,
      duplicate.getByRole("button", { name: `Actions for ${duplicateTemplateName}` })
    );
    page.once("dialog", (confirm) => void confirm.accept());
    await click(page, page.getByRole("menuitem", { name: "Delete" }));
    await expect(duplicate).toBeHidden({ timeout: 30_000 });

    expect(consoleErrors).toEqual([]);
  });

  test("creates the realistic estimate, recovers from failure, and preserves exact financials", async ({
    page,
  }) => {
    test.setTimeout(420_000);
    await loginAsE2EOwner(page, "/estimate-templates");
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) metrics.routeTransitions += 1;
    });

    const row = page.getByTestId("estimate-template-row").filter({ hasText: templateName }).first();
    const applyStarted = performance.now();
    await click(page, row.getByRole("link", { name: "Use" }));
    await expect(page).toHaveURL(/\/estimates\/new\?templateId=/, { timeout: 30_000 });
    await expect(page.getByLabel("Line item 30 title").locator("visible=true")).toHaveValue(
      "Final cleaning and turnover",
      { timeout: 30_000 }
    );
    const sectionTitleInputs = page
      .locator('.eb-scope-sections-list:visible input[aria-label^="Section name for"]')
      .locator("visible=true");
    await expect
      .poll(() =>
        sectionTitleInputs.evaluateAll((inputs) =>
          inputs.map((input) => (input as HTMLInputElement).value)
        )
      )
      .toEqual(sections.map((section) => section.title));
    metrics.templateApplyMs = Math.round(performance.now() - applyStarted);

    const firstSectionTitleByInitialLabel = page
      .getByLabel(`Section name for ${sections[0].title}`)
      .locator("visible=true");
    await expect(firstSectionTitleByInitialLabel).toBeVisible();
    const firstSectionId = await firstSectionTitleByInitialLabel.evaluate(
      (input) =>
        input.closest<HTMLElement>("[data-estimate-section-id]")?.dataset.estimateSectionId ?? null
    );
    expect(firstSectionId).toBeTruthy();
    const firstSectionTitle = page
      .locator(
        `[data-estimate-section-id="${firstSectionId}"] input[aria-label^="Section name for"]`
      )
      .locator("visible=true");
    await firstSectionTitle.fill("Preconstruction & Mobilization");
    const firstQuantity = page.getByLabel("Line item 1 quantity").locator("visible=true");
    const firstUnitPrice = page.getByLabel("Line item 1 unit price").locator("visible=true");
    await firstQuantity.fill("-1");
    await expect(firstQuantity).toHaveValue("0");
    await firstQuantity.fill("1");
    await firstUnitPrice.fill("-100");
    await expect(firstUnitPrice).toHaveValue("0");
    await firstUnitPrice.fill("3750");
    metrics.keyboardInteractions += 6;

    await click(page, page.getByRole("button", { name: /Edit details/i }));
    const details = page.getByRole("dialog", {
      name: /Customer \/ project \/ pricing details/i,
    });
    await expect(details).toBeVisible();
    await click(page, details.getByRole("button").filter({ hasText: "Select customer" }));
    const customerDialog = page.getByRole("dialog", { name: "Select customer" });
    await customerDialog.getByPlaceholder("Search by name or email").fill(customerName);
    await click(page, customerDialog.getByRole("button").filter({ hasText: customerName }).first());
    await details.getByPlaceholder("Project name").fill(seedProjectName);
    await details.getByPlaceholder("Site or client address").fill("100 Local Certification Lane");
    await details.getByLabel("Valid until").fill("2026-09-30");
    await details.getByLabel("Sales").fill("HH Group Design-Build Team");
    await details.getByLabel("Itemized").check();
    metrics.keyboardInteractions += 5;

    await click(page, details.getByRole("button", { name: "Tax presets" }));
    await click(page, page.getByRole("menuitem", { name: /Hawaii GET/ }));
    await expect(details.getByLabel("Tax amount")).toHaveValue(String(expectedTax));
    await click(page, details.getByRole("button", { name: "Discount options" }));
    await page.getByLabel("Fixed discount amount").fill(String(expectedDiscount));
    await click(page, page.getByRole("button", { name: "Apply", exact: true }).last());
    await expect(details.getByRole("spinbutton", { name: "Discount" })).toHaveValue(
      String(expectedDiscount)
    );
    await click(page, details.getByRole("button", { name: "Save", exact: true }));
    await expect(details).toBeHidden();

    const lineMenus = page.getByRole("button", { name: "More actions" }).locator("visible=true");
    await click(page, lineMenus.nth(0));
    await page.getByRole("menuitem", { name: "Set status" }).hover();
    const allowanceMenuItem = page
      .getByRole("menuitem", { name: "Allowance" })
      .locator("visible=true");
    await expect(allowanceMenuItem).toBeVisible();
    await allowanceMenuItem.press("Enter");
    metrics.keyboardInteractions += 1;
    await expect(
      page.getByText("Allowance", { exact: true }).locator("visible=true").first()
    ).toBeVisible();

    await click(page, lineMenus.nth(1));
    await page.getByRole("menuitem", { name: "Set status" }).hover();
    const optionalMenuItem = page
      .getByRole("menuitem", { name: "Optional" })
      .locator("visible=true");
    await expect(optionalMenuItem).toBeVisible();
    await optionalMenuItem.press("Enter");
    metrics.keyboardInteractions += 1;
    await expect(
      page.getByText("Optional", { exact: true }).locator("visible=true").first()
    ).toBeVisible();

    await click(page, lineMenus.nth(2));
    await click(page, page.getByRole("menuitem", { name: "Hide amount on PDF" }));

    await click(page, lineMenus.nth(0));
    await click(page, page.getByRole("menuitem", { name: "Duplicate" }));
    const copiedRow = await lineItemCardByTitle(page, "Mobilization and site setup (copy)");
    const copiedItemId = await copiedRow.getAttribute("data-estimate-line-item-id");
    expect(copiedItemId).toBeTruthy();
    const copiedItemByIdentity = page.locator(`[data-estimate-line-item-id="${copiedItemId}"]`);
    const copiedTitle = copiedRow.locator('input[aria-label$=" title"]');
    await expect(copiedTitle).toHaveValue("Mobilization and site setup (copy)");
    await click(page, copiedRow.getByRole("button", { name: "More actions" }));
    await click(page, page.getByRole("menuitem", { name: "Remove line item" }));
    const deleteLineDialog = page.getByRole("dialog", { name: "Delete line item?" });
    await expect(deleteLineDialog).toBeVisible();
    await click(page, deleteLineDialog.getByRole("button", { name: "Delete", exact: true }));
    await expect(copiedItemByIdentity).toHaveCount(0);
    await expect
      .poll(() =>
        page
          .locator('[data-estimate-line-item-id] input[aria-label$=" title"]')
          .evaluateAll(
            (inputs) =>
              inputs.filter(
                (input) =>
                  (input as HTMLInputElement).value === "Mobilization and site setup (copy)"
              ).length
          )
      )
      .toBe(0);

    await click(page, page.getByRole("button", { name: "Collapse section" }).first());
    await expect(page.getByRole("button", { name: "Expand section" }).first()).toBeVisible();
    await click(page, page.getByRole("button", { name: "Expand section" }).first());

    const firstReorder = page.locator('button[aria-label="Reorder section"]:visible').first();
    await firstReorder.focus();
    await firstReorder.press("Space");
    await firstReorder.press("ArrowDown");
    await firstReorder.press("Space");
    metrics.keyboardInteractions += 3;
    expectedPersistedSectionOrder = await sectionTitleInputs.evaluateAll((inputs) =>
      inputs.map((input) => (input as HTMLInputElement).value.trim())
    );

    await addNote(
      page,
      "Exclusions",
      "Permit fees, hazardous-material remediation, concealed structural damage, utility-company charges, and owner-selected premium upgrades are excluded unless expressly listed."
    );
    await addNote(
      page,
      "Assumptions",
      "Pricing assumes normal weekday access, timely owner decisions, and clear work areas.\n价格基于正常工作日施工、业主及时确认以及现场通道畅通。"
    );
    await addNote(
      page,
      "Warranty",
      "Contractor workmanship is warranted for one year from substantial completion. Manufacturer warranties pass through to the owner."
    );
    await addNote(
      page,
      "Custom Note",
      "Owner responsibilities: provide timely access, selections, utilities, and approvals.\n承包商责任：依照批准图纸施工、保护现场并保持专业沟通。\nSpecial characters: Hawaiʻi · ½ · ± · ©"
    );

    await click(page, page.getByRole("button", { name: "Schedule Payment" }));
    const emptyPayment = page.getByRole("dialog", { name: "Schedule Payment" });
    await click(page, emptyPayment.getByRole("button", { name: "Save", exact: true }));
    await expect(emptyPayment.getByRole("alert")).toContainText("Enter a payment name");
    await click(page, emptyPayment.getByRole("button", { name: "Cancel" }));

    await addMilestone(page, {
      title: "Contract deposit",
      description: "Due upon signed acceptance and before mobilization.",
      percent: "10",
      dueDate: "2026-08-05",
    });
    await addMilestone(page, {
      title: "Foundation milestone",
      description: "Due after footing and slab placement is substantially complete.",
      percent: "20",
      dueDate: "2026-09-01",
    });
    await addMilestone(page, {
      title: "Framing milestone",
      description: "Due after structural framing and roof dry-in.",
      percent: "25",
      dueDate: "2026-10-01",
    });
    await addMilestone(page, {
      title: "Envelope milestone",
      description: "Due after roofing, windows, doors, and weather barrier are complete.",
      percent: "20",
      dueDate: "2026-11-01",
    });
    await addMilestone(page, {
      title: "Final completion",
      description: "Fixed final balance due at substantial completion and turnover.",
      amount: String(Math.round(createdTotal * 0.25 * 100) / 100),
      dueDate: "2026-12-15",
    });
    await expect(page.getByText("Remaining $0.00", { exact: false })).toBeVisible();

    let createActionPosts = 0;
    await page.route("**/estimates/new**", async (route) => {
      const request = route.request();
      if (request.method() === "POST" && request.headers()["next-action"]) {
        createActionPosts += 1;
      }
      await route.continue();
    });

    await page.evaluate(() => {
      const nativeFetch = window.fetch.bind(window);
      let failNextServerAction = true;
      window.fetch = async (input, init) => {
        const headers = new Headers(init?.headers);
        if (
          failNextServerAction &&
          init?.method?.toUpperCase() === "POST" &&
          headers.has("Next-Action")
        ) {
          failNextServerAction = false;
          throw new TypeError("Temporary network failure. Please try again.");
        }
        return nativeFetch(input, init);
      };
    });

    const saveButton = page.getByRole("button", { name: "Save Estimate" });
    const failureStarted = performance.now();
    await click(page, saveButton);
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(
      "Temporary network failure. Please try again."
    );
    await expect(page.getByText("Save failed — try again", { exact: true }).first()).toBeVisible();
    metrics.firstSaveFailureFeedbackMs = Math.round(performance.now() - failureStarted);
    expect(createActionPosts).toBe(0);
    await expect(page).toHaveURL(/\/estimates\/new\?templateId=/);
    await expect(firstSectionTitle).toHaveValue("Preconstruction & Mobilization");
    await expect(firstUnitPrice).toHaveValue("3750");
    await expect(page.getByText("Remaining $0.00", { exact: false })).toBeVisible();

    const retryStarted = performance.now();
    await saveButton.evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
    await expect(page).toHaveURL(
      /\/estimates\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\?|$)/i,
      { timeout: 60_000 }
    );
    metrics.firstSaveRetryMs = Math.round(performance.now() - retryStarted);
    expect(createActionPosts).toBe(1);
    estimateId = page.url().match(/\/estimates\/([^/?#]+)/)?.[1] ?? "";
    expect(estimateId).toBeTruthy();

    const heading = page.getByTestId("estimate-detail-header").getByRole("heading");
    estimateNumber = ((await heading.textContent())?.trim() ?? "").replace(/\s*·?\s+Rev\s+0$/, "");
    expect(estimateNumber).toMatch(/^EST-/);
    await expect(page.locator("body")).toContainText("Preconstruction & Mobilization");
    await page.getByRole("button", { name: "Estimate actions" }).click();
    await page.getByRole("menuitem", { name: "Payment Schedule", exact: true }).click();
    const paymentSheet = page.getByTestId("estimate-payment-schedule-sheet");
    await expect(paymentSheet).toContainText("Final completion");
    await expect(paymentSheet).toContainText("Due: Dec 15, 2026");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Estimate actions" }).click();
    await page.getByRole("menuitem", { name: "Notes", exact: true }).click();
    await expect(page.getByTestId("estimate-notes-sheet")).toContainText("承包商责任");
    await page.keyboard.press("Escape");

    const admin = localAdmin();
    const { data: matching, error } = await admin
      .from("estimates")
      .select("id,number,customer_id")
      .eq("id", estimateId);
    expect(error).toBeNull();
    expect(matching).toHaveLength(1);
    expect(matching?.[0]?.customer_id).toBe("33333333-3333-4333-8333-333333333333");
    expect(errors).toEqual([]);
  });

  test("certifies detail, edit, list, Preview, Print, PDF, and responsive workflows", async ({
    page,
  }) => {
    test.setTimeout(420_000);
    expect(estimateId).toBeTruthy();
    await loginAsE2EOwner(page, `/estimates/${estimateId}`);
    await page.waitForLoadState("networkidle");
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    const reloadStarted = performance.now();
    await reloadWithE2EAuth(page);
    await expect(page.getByTestId("estimate-detail-header")).toBeVisible();
    await page.waitForLoadState("networkidle");
    metrics.reloadMs = Math.round(performance.now() - reloadStarted);

    await click(page, page.getByRole("button", { name: "Edit", exact: true }));
    const editStarted = performance.now();
    const mobilizationEditRow = await lineItemCardByTitle(page, "Mobilization and site setup");
    const price = mobilizationEditRow.locator('input[aria-label$="unit price"]');
    await price.fill("-10");
    await expect(price).toHaveValue("0");
    await price.fill("3800");
    await price.press("Tab");
    await price.press("Shift+Tab");
    metrics.keyboardInteractions += 3;
    await click(
      page,
      page
        .getByTestId("estimate-detail-header-actions")
        .getByRole("button", { name: "Save", exact: true })
    );
    await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForLoadState("networkidle");
    metrics.editSaveMs = Math.round(performance.now() - editStarted);
    await reloadWithE2EAuth(page);
    await click(page, page.getByRole("button", { name: "Edit", exact: true }));
    const persistedSections = page.locator(
      ".eb-scope-sections-list:visible [data-estimate-section-id]"
    );
    await expect
      .poll(() =>
        persistedSections.evaluateAll((sectionElements) =>
          sectionElements.map(
            (section) =>
              section
                .querySelector<HTMLElement>('button[aria-label^="Section:"]')
                ?.textContent?.trim() ?? ""
          )
        )
      )
      .toEqual(expectedPersistedSectionOrder);
    const persistedMobilizationRow = await lineItemCardByTitle(page, "Mobilization and site setup");
    await expect(persistedMobilizationRow.locator('input[aria-label$="unit price"]')).toHaveValue(
      "3800"
    );
    await click(page, page.getByRole("button", { name: "Save", exact: true }).first());
    await expect(page.locator("main")).toContainText(
      `$${expectedTotal.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`
    );
    await page.waitForLoadState("networkidle");

    await gotoWithE2EAuth(page, "/estimates");
    const search = page.getByPlaceholder("Search estimates…").locator("visible=true");
    await search.fill(estimateNumber);
    const estimateRecords = page.getByTestId("estimate-list-records");
    await expect(estimateRecords.getByText(estimateNumber, { exact: true })).toBeVisible();
    await expect(estimateRecords).toContainText("Rev 0");
    const statusRail = page.getByTestId("estimate-list-summary-rail");
    await statusRail.getByRole("button", { name: /^Draft \d+$/ }).click();
    await expect(estimateRecords.getByText(estimateNumber, { exact: true })).toBeVisible();
    await expect(estimateRecords).toContainText("Rev 0");
    await statusRail.getByRole("button", { name: /^All \d+$/ }).click();
    await search.fill("No estimate should match this certification search");
    await expect(
      page
        .getByText(/No estimates/i)
        .locator("visible=true")
        .first()
    ).toBeVisible();
    await search.fill(estimateNumber);
    await click(page, estimateRecords.getByText(estimateNumber, { exact: true }));
    await expect(page.getByTestId("estimate-detail-header")).toBeVisible();
    await page.waitForLoadState("networkidle");

    const previewStarted = performance.now();
    await click(page, page.getByRole("link", { name: "Preview", exact: true }));
    await expect(page.getByTestId("estimate-document")).toBeVisible({ timeout: 60_000 });
    metrics.previewOpenMs = Math.round(performance.now() - previewStarted);
    const document = page.getByTestId("estimate-document");
    await expect(document).toContainText("Preconstruction & Mobilization");
    await expect(document).toContainText("Payment Schedule");
    await expect(document).toContainText("Notes & Clarifications");
    await expect(document).toContainText("承包商责任");
    await expect(document).toContainText("Allowance");
    await expect(document).toContainText("Optional");
    const previewPages = document.getByTestId("estimate-preview-page");
    const previewPageCount = await previewPages.count();
    expect(previewPageCount).toBeGreaterThan(1);
    expect(
      (await previewPages.locator(".estimate-page-label").allTextContents()).map((label) =>
        label.trim()
      )
    ).toEqual(
      Array.from(
        { length: previewPageCount },
        (_, index) => `Page ${index + 1} of ${previewPageCount}`
      )
    );
    const paymentPages = document.locator('[data-final-packet-part^="payment"]');
    expect(await paymentPages.count()).toBeGreaterThan(0);
    for (const paymentPage of await paymentPages.all()) {
      await expect(paymentPage).toContainText("Payment Schedule");
    }
    await expect(document.locator(".estimate-payment-row")).toHaveCount(5);
    await expect(document.locator('[data-final-packet-part="acceptance"]')).toContainText(
      "Client Acceptance"
    );
    expect(
      await previewPages.evaluateAll((pages) =>
        pages.every(
          (previewPage) =>
            previewPage.getBoundingClientRect().height <= 1057 &&
            previewPage.scrollHeight <= previewPage.clientHeight + 3
        )
      )
    ).toBe(true);
    const hiddenRow = document
      .getByTestId("estimate-line-item-output")
      .filter({ hasText: "Temporary fencing" });
    await expect(hiddenRow).toContainText("—");

    const fitStarted = performance.now();
    await click(page, page.getByRole("button", { name: "Zoom in" }));
    await click(page, page.getByRole("button", { name: "Zoom out" }));
    await click(page, page.getByRole("button", { name: "Fit pages" }));
    metrics.previewFitMs = Math.round(performance.now() - fitStarted);
    await assertNoHorizontalOverflow(page);

    const printStarted = performance.now();
    const printPagePromise = page.context().waitForEvent("page");
    await click(page, page.getByRole("link", { name: "Print", exact: true }));
    const printPage = await printPagePromise;
    await printPage.waitForLoadState("domcontentloaded");
    const printDocument = printPage.getByTestId("estimate-document");
    await expect(printDocument).toContainText("Payment Schedule");
    await expect(printDocument).toContainText("Notes & Clarifications");
    await expect(printDocument).toContainText("Client Acceptance");
    expect(await printDocument.getByTestId("estimate-preview-page").count()).toBe(previewPageCount);
    metrics.printOpenMs = Math.round(performance.now() - printStarted);
    await printPage.close();

    const pdfStarted = performance.now();
    const pdfResponse = await page.request.get(`/api/estimates/${estimateId}/pdf`);
    expect(pdfResponse.status()).toBe(200);
    const pdf = await pdfResponse.body();
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdfResponse.headers()["content-disposition"]).toContain(
      `Estimate-${estimateNumber}_Rev_0.pdf`
    );
    const pdfPageCount = pdf.toString("latin1").match(/\/Type\s*\/Page\b/g)?.length ?? 0;
    expect(pdfPageCount).toBe(previewPageCount);
    await writeFile(join(tmpdir(), "hh-estimate-operational-certification.pdf"), pdf);
    metrics.pdfMs = Math.round(performance.now() - pdfStarted);

    const repeatedStarted = performance.now();
    const repeated = await Promise.all([
      page.request.get(`/api/estimates/${estimateId}/pdf`),
      page.request.get(`/api/estimates/${estimateId}/pdf`),
    ]);
    expect(repeated.map((response) => response.status())).toEqual([200, 200]);
    metrics.repeatedPdfMs = Math.round(performance.now() - repeatedStarted);

    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(new RegExp(`/estimates/${estimateId}`));
    await page.waitForLoadState("networkidle");

    const viewports = [
      { name: "desktop-1440", width: 1440, height: 900 },
      { name: "desktop-1280", width: 1280, height: 800 },
      { name: "ipad-portrait", width: 820, height: 1180 },
      { name: "ipad-landscape", width: 1180, height: 820 },
      { name: "mobile", width: 390, height: 844 },
    ];
    for (const viewport of viewports) {
      const started = performance.now();
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await gotoWithE2EAuth(page, `/estimates/${estimateId}`);
      await expect(page.getByTestId("estimate-detail-header")).toBeVisible();
      await page.waitForLoadState("networkidle");
      await assertNoHorizontalOverflow(page);
      await click(page, page.getByRole("button", { name: "Edit", exact: true }));
      await expect(
        page.getByRole("button", { name: "Collapse section" }).locator("visible=true").first()
      ).toBeVisible();
      await click(
        page,
        page.getByRole("button", { name: "Collapse section" }).locator("visible=true").first()
      );
      await click(
        page,
        page.getByRole("button", { name: "Expand section" }).locator("visible=true").first()
      );
      await assertNoHorizontalOverflow(page);
      const save = page
        .getByRole("button", { name: "Save", exact: true })
        .locator("visible=true")
        .first();
      const box = await save.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(viewport.width <= 820 ? 44 : 30);
      await click(
        page,
        page.getByRole("button", { name: "Save", exact: true }).locator("visible=true").first()
      );
      await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
      await page.waitForLoadState("networkidle");
      await gotoWithE2EAuth(page, `/estimates/${estimateId}/preview`);
      await expect(page.getByTestId("estimate-document")).toBeVisible({ timeout: 60_000 });
      await page.waitForLoadState("networkidle");
      await assertNoHorizontalOverflow(page);
      const fitPages = page.getByRole("button", { name: "Fit pages", exact: true });
      if (viewport.width <= 700) {
        await expect(fitPages).toBeHidden();
        const moreActions = page.getByRole("button", {
          name: "More preview actions",
          exact: true,
        });
        await expect(moreActions).toBeVisible();
        const moreActionsBox = await moreActions.boundingBox();
        expect(moreActionsBox?.height ?? 0).toBeGreaterThanOrEqual(44);
        await click(page, moreActions);
        const fitPage = page.getByRole("menuitem", { name: "Fit page", exact: true });
        await expect(fitPage).toBeVisible();
        const fitPageBox = await fitPage.boundingBox();
        expect(fitPageBox?.height ?? 0).toBeGreaterThanOrEqual(44);
        await fitPage.press("Escape");
        await expect(moreActions).toBeFocused();
      } else {
        await expect(fitPages).toBeVisible();
      }
      metrics.responsiveMs![viewport.name] = Math.round(performance.now() - started);
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoWithE2EAuth(page, `/estimates/${estimateId}`);
    await click(page, page.getByRole("button", { name: "Mark as Sent", exact: true }));
    await expect(page.getByText("Sent", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark accepted", exact: true })).toBeEnabled({
      timeout: 30_000,
    });
    await page.waitForLoadState("networkidle");
    await reloadWithE2EAuth(page);
    await expect(page.getByText("Sent", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark as Draft", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Mark accepted", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark declined", exact: true })).toBeVisible();

    expect(consoleErrors).toEqual([]);
  });

  test("keeps a 100-line estimate responsive and publication-safe", async ({ page }) => {
    test.setTimeout(240_000);
    const admin = localAdmin();
    const largeEstimateId = randomUUID();
    const largeEstimateNumber = `LOCAL-PERF-${suffix}`;
    const today = new Date().toISOString().slice(0, 10);
    const categoryRows = Array.from({ length: 10 }, (_, sectionIndex) => ({
      estimate_id: largeEstimateId,
      cost_code: `large-${sectionIndex + 1}`,
      display_name: `Large Scope Section ${sectionIndex + 1}`,
      order_index: sectionIndex,
    }));
    const itemRows = categoryRows.flatMap((section, sectionIndex) =>
      Array.from({ length: 10 }, (_, itemIndex) => ({
        estimate_id: largeEstimateId,
        cost_code: section.cost_code,
        desc: `Large line ${sectionIndex * 10 + itemIndex + 1}\nDetailed bilingual scope paragraph ${sectionIndex + 1}.${itemIndex + 1}. 大型报价性能验证。`,
        qty: 1,
        unit: "EA",
        unit_cost: 1000 + sectionIndex * 100 + itemIndex,
        markup_pct: 0,
        sort_order: sectionIndex * 10 + itemIndex,
        status: "included",
        hide_amount_on_pdf: false,
      }))
    );
    const initialSubtotal = itemRows.reduce((sum, row) => sum + row.unit_cost, 0);

    try {
      const estimateInsert = await admin.from("estimates").insert({
        id: largeEstimateId,
        number: largeEstimateNumber,
        client: customerName,
        project: seedProjectName,
        status: "Draft",
        updated_at: today,
        customer_id: "33333333-3333-4333-8333-333333333333",
      });
      expect(estimateInsert.error).toBeNull();
      const metaInsert = await admin.from("estimate_meta").insert({
        estimate_id: largeEstimateId,
        client_name: customerName,
        project_name: seedProjectName,
        project_site_address: "200 Local Large Estimate Lane",
        estimate_date: today,
        tax: 0,
        discount: 0,
        overhead_pct: 0,
        profit_pct: 0,
        cost_category_names: Object.fromEntries(
          categoryRows.map((row) => [row.cost_code, row.display_name])
        ),
        document_notes: [
          {
            id: randomUUID(),
            type: "Custom Note",
            title: "Large bilingual notes",
            body: "Long English publication note. 长篇中文说明用于验证字体、换行与 PDF 文本提取。",
          },
        ],
      });
      expect(metaInsert.error).toBeNull();
      expect((await admin.from("estimate_categories").insert(categoryRows)).error).toBeNull();
      expect((await admin.from("estimate_items").insert(itemRows)).error).toBeNull();

      await loginAsE2EOwner(page, `/estimates/${largeEstimateId}`);
      const detailStarted = performance.now();
      await expect(page.locator("main")).toContainText("Large line 100", {
        timeout: 60_000,
      });
      metrics.largeDetailMs = Math.round(performance.now() - detailStarted);
      await click(page, page.getByRole("button", { name: "Edit", exact: true }));
      await expect(page.locator(".eb-line-item-card:visible")).toHaveCount(100);
      const editStarted = performance.now();
      const firstPrice = page.getByLabel("Line item unit price").locator("visible=true").first();
      await firstPrice.fill("1001");
      await firstPrice.press("Tab");
      await click(
        page,
        page
          .getByTestId("estimate-detail-header-actions")
          .getByRole("button", { name: "Save", exact: true })
      );
      await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
      metrics.largeEditSaveMs = Math.round(performance.now() - editStarted);
      await reloadWithE2EAuth(page);
      await expect(page.locator("main")).toContainText(
        `$${(initialSubtotal + 1).toLocaleString("en-US")}.00`
      );

      const previewStarted = performance.now();
      await page.getByRole("link", { name: "Preview", exact: true }).click();
      await expect(page).toHaveURL(
        new RegExp(
          `/estimates/${largeEstimateId}/preview\\?origin=builder&returnSection=large-1&returnScroll=0$`
        )
      );
      const estimateDocument = page.getByTestId("estimate-document");
      await expect(estimateDocument).toContainText("Large line 100", { timeout: 60_000 });
      await page.waitForLoadState("networkidle");
      metrics.largePreviewMs = Math.round(performance.now() - previewStarted);
      const browserMetrics = await page.evaluate(() => {
        const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
        const heap = performance as Performance & {
          memory?: { usedJSHeapSize?: number };
        };
        return {
          transferBytes: resources.reduce((sum, entry) => sum + (entry.transferSize || 0), 0),
          domNodes: document.getElementsByTagName("*").length,
          heapBytes: heap.memory?.usedJSHeapSize ?? null,
        };
      });
      metrics.largeTransferBytes = browserMetrics.transferBytes;
      metrics.largeDomNodes = browserMetrics.domNodes;
      metrics.largeHeapBytes = browserMetrics.heapBytes;

      const pdfStarted = performance.now();
      const pdfResponse = await page.request.get(`/api/estimates/${largeEstimateId}/pdf`);
      expect(pdfResponse.status()).toBe(200);
      expect((await pdfResponse.body()).subarray(0, 4).toString()).toBe("%PDF");
      metrics.largePdfMs = Math.round(performance.now() - pdfStarted);
    } finally {
      await cleanupEstimateGraph(largeEstimateId);
    }
  });

  test("removes the controlled template while retaining one owner-review Estimate", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await loginAsE2EOwner(page, "/estimate-templates");
    const row = page.getByTestId("estimate-template-row").filter({ hasText: templateName }).first();
    await expect(row).toBeVisible();
    await click(page, row.getByRole("button", { name: `Actions for ${templateName}` }));
    page.once("dialog", (confirm) => void confirm.accept());
    await click(page, page.getByRole("menuitem", { name: "Delete" }));
    await expect(row).toBeHidden({ timeout: 30_000 });
    await gotoWithE2EAuth(page, `/estimates/${estimateId}/preview`);
    await expect(page.getByTestId("estimate-document")).toBeVisible({ timeout: 60_000 });
  });

  test("completes one revision-aware Estimate to Project, Invoice, document, and Activity flow", async ({
    page,
  }) => {
    test.setTimeout(360_000);
    const admin = localAdmin();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await loginAsE2EOwner(page, `/estimates/${estimateId}`);
    await expect(page.getByTestId("estimate-detail-header")).toContainText(estimateNumber);

    await expect(page.getByText("Sent", { exact: true }).locator("visible=true")).toBeVisible();
    await click(page, page.getByRole("button", { name: "Mark accepted", exact: true }));
    await expect(page.getByText("Approved", { exact: true }).locator("visible=true")).toBeVisible();

    // Conversion belongs to the current approved revision. Historical revisions
    // remain read-only, so establish the canonical Project before creating Rev 1.
    await click(page, page.getByRole("button", { name: "Convert to Project", exact: true }));
    const projectDrawer = page.getByRole("dialog", { name: "Set up project" });
    await expect(projectDrawer).toBeVisible();
    await projectDrawer
      .getByLabel("Project name")
      .fill(`LOCAL Estimate Certification Project ${suffix}`);
    await click(page, projectDrawer.getByRole("button", { name: "Create project", exact: true }));
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+$/, { timeout: 30_000 });
    convertedProjectId = new URL(page.url()).pathname.split("/").pop() ?? "";
    expect(convertedProjectId).toBeTruthy();

    const projects = await admin
      .from("projects")
      .select("id, source_estimate_id, customer_id, budget, snapshot_revenue")
      .eq("source_estimate_id", estimateId);
    expect(projects.error).toBeNull();
    expect(projects.data).toHaveLength(1);
    expect(projects.data?.[0]?.id).toBe(convertedProjectId);
    expect(projects.data?.[0]?.customer_id).toBe("33333333-3333-4333-8333-333333333333");
    expect(Number(projects.data?.[0]?.budget)).toBe(expectedTotal);
    expect(Number(projects.data?.[0]?.snapshot_revenue)).toBe(expectedTotal);

    await gotoWithE2EAuth(page, `/estimates/${estimateId}`);
    await expect(page.getByTestId("estimate-detail-header")).toContainText("Converted to Project");
    await click(page, page.getByTestId("create-estimate-revision-action"));
    await page.waitForURL(
      (url) =>
        /^\/estimates\/[0-9a-f-]+$/i.test(url.pathname) &&
        url.pathname !== `/estimates/${estimateId}`,
      { timeout: 30_000 }
    );
    revisionId = new URL(page.url()).pathname.split("/").pop() ?? "";
    expect(revisionId).toBeTruthy();
    expect(revisionId).not.toBe(estimateId);
    await expect(page.getByTestId("estimate-detail-header")).toContainText(estimateNumber);
    await expect(page.getByTestId("estimate-detail-header")).toContainText("Rev 1");
    await expect(page.getByTestId("estimate-detail-header")).toContainText("Draft");

    const revisionSchedule = await admin
      .from("estimate_payment_schedule_items")
      .select("title, amount, due_date, status, invoice_id, sort_order")
      .eq("estimate_id", revisionId)
      .order("sort_order");
    expect(revisionSchedule.error).toBeNull();
    expect(revisionSchedule.data).toHaveLength(5);
    expect(revisionSchedule.data?.every((row) => row.due_date === null)).toBe(true);
    expect(revisionSchedule.data?.every((row) => row.status === "draft")).toBe(true);
    expect(revisionSchedule.data?.every((row) => row.invoice_id === null)).toBe(true);

    await click(page, page.getByRole("link", { name: "Previous revision", exact: true }));
    await expect(page).toHaveURL(new RegExp(`/estimates/${estimateId}$`));
    await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Current revision", exact: true })).toBeVisible();
    await expect(page.getByTestId("estimate-detail-header")).toContainText("Converted to Project");
    const sourceMilestones = await admin
      .from("estimate_payment_schedule_items")
      .select("id, amount, invoice_id")
      .eq("estimate_id", estimateId)
      .order("sort_order");
    expect(sourceMilestones.error).toBeNull();
    const firstMilestone = sourceMilestones.data?.[0];
    expect(firstMilestone?.id).toBeTruthy();
    const milestoneAmount = Number(firstMilestone?.amount ?? 0);

    await page.getByRole("button", { name: "Estimate actions" }).click();
    await page.getByRole("menuitem", { name: "Payment Schedule", exact: true }).click();
    const convertedPaymentSheet = page.getByTestId("estimate-payment-schedule-sheet");
    await expect(convertedPaymentSheet).toBeVisible();
    await click(
      page,
      convertedPaymentSheet.getByRole("link", { name: "Create Draft Invoice" }).first()
    );
    await expect(page).toHaveURL(/\/financial\/invoices\/new\?/, { timeout: 30_000 });
    await expect(page.getByTestId("invoice-new-project-select")).toHaveValue(convertedProjectId);
    await click(page, page.getByRole("button", { name: "Create draft invoice" }));
    await expect(page).toHaveURL(/\/financial\/invoices\/[0-9a-f-]+\/preview/, {
      timeout: 30_000,
    });
    milestoneInvoiceId = page.url().match(/\/financial\/invoices\/([^/?#]+)/)?.[1] ?? "";
    expect(milestoneInvoiceId).toBeTruthy();

    const invoice = await admin
      .from("invoices")
      .select("id, project_id, customer_id, status, subtotal, tax_amount, total")
      .eq("id", milestoneInvoiceId)
      .single();
    expect(invoice.error).toBeNull();
    expect(invoice.data?.project_id).toBe(convertedProjectId);
    expect(invoice.data?.customer_id).toBe("33333333-3333-4333-8333-333333333333");
    expect(invoice.data?.status).toBe("Draft");
    expect(Number(invoice.data?.total)).toBe(milestoneAmount);
    expect(Number(invoice.data?.subtotal) + Number(invoice.data?.tax_amount)).toBeCloseTo(
      milestoneAmount,
      2
    );

    await gotoWithE2EAuth(page, `/estimates/${estimateId}`);
    await page.getByRole("button", { name: "Estimate actions" }).click();
    await page.getByRole("menuitem", { name: "Activity", exact: true }).click();
    const activity = page
      .getByTestId("estimate-activity-sheet")
      .getByTestId("estimate-activity-timeline");
    for (const event of [
      "Estimate Created",
      "Marked as Sent",
      "Approved",
      "Revision Created",
      "Converted to Project",
      "Draft Invoice Created",
    ]) {
      await expect(activity).toContainText(event);
    }

    await gotoWithE2EAuth(page, `/estimates/${estimateId}/preview`);
    await expect(page.getByTestId("estimate-preview-context")).toContainText(
      `${estimateNumber} Rev 0`
    );
    await expect(page.getByTestId("estimate-revision-context")).toContainText(
      "Historical revision · Read-only"
    );
    await gotoWithE2EAuth(page, `/estimates/${estimateId}/print`);
    await expect(page.locator(".estimate-print-context-identity")).toHaveText(
      `${estimateNumber} Rev 0`
    );

    const pdfResponse = await page.request.get(`/api/estimates/${estimateId}/pdf`);
    expect(pdfResponse.status()).toBe(200);
    expect(pdfResponse.headers()["content-disposition"]).toContain(`${estimateNumber}_Rev_0.pdf`);
    expect((await pdfResponse.body()).subarray(0, 4).toString("utf8")).toBe("%PDF");

    await gotoWithE2EAuth(page, `/estimates/${revisionId}/preview`);
    await expect(page.getByTestId("estimate-preview-context")).toContainText(
      `${estimateNumber} Rev 1`
    );
    await expect(page.getByTestId("estimate-revision-context")).toContainText("Current revision");
  });
});
