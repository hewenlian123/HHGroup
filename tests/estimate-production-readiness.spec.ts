import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { E2E_PRESERVED_CUSTOMER_ID, E2E_PRESERVED_PROJECT_LABEL } from "./e2e-cleanup-db";
import { loginAsE2EOwner } from "./e2e-auth-owner";
import { expectBoundedLetterPages } from "./estimate-document-page-integrity";
import { assertEstimateCertificationLocalOnly } from "./e2e-supabase-url-guard";

const EVIDENCE_DIR = "/private/tmp/hh-estimate-production-readiness";
const SYSTEM_WARNING_TEXT = "System issue detected";
const createdEstimateIds = new Set<string>();

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

async function cleanupEstimateGraph(estimateId: string): Promise<void> {
  const admin = localAdmin();
  await admin.from("estimate_payment_schedule_items").delete().eq("estimate_id", estimateId);
  await admin.from("estimate_items").delete().eq("estimate_id", estimateId);
  await admin.from("estimate_categories").delete().eq("estimate_id", estimateId);
  await admin.from("estimate_meta").delete().eq("estimate_id", estimateId);
  await admin.from("estimates").delete().eq("id", estimateId);
}

async function addBlankSection(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: /^Add Section$/i })
    .first()
    .click();
  await page.getByRole("menuitem", { name: /^Blank section$/i }).click();
}

async function fillEstimateDetails(
  page: Page,
  values: { clientName: string; projectName: string; documentStyle?: "proposal" | "itemized" }
): Promise<void> {
  const dialog = page.getByRole("dialog");
  if (!(await dialog.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: /Edit details/i }).click();
  }
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder("Client or company name").fill(values.clientName);
  await dialog.getByPlaceholder("Project name").fill(values.projectName);
  await dialog.getByPlaceholder("Site or client address").fill("800 Local Readiness Way");
  if (values.documentStyle) {
    await dialog
      .getByRole("radio", {
        name: values.documentStyle === "proposal" ? "Proposal" : "Itemized",
      })
      .check();
  }
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden();
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const root = document.documentElement;
        const app = document.querySelector<HTMLElement>("[data-app-scroll-root]");
        return Math.max(
          root.scrollWidth - root.clientWidth,
          app ? app.scrollWidth - app.clientWidth : 0
        );
      })
    )
    .toBe(0);
}

async function readDescriptionMetrics(description: Locator): Promise<{
  height: number;
  clientHeight: number;
  scrollHeight: number;
  styleHeight: number;
  overflowY: string;
  maxHeight: string;
  contentEditable: string | null;
}> {
  return description.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      height: element.getBoundingClientRect().height,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      styleHeight: Number.parseFloat(element.style.height || "0"),
      overflowY: style.overflowY,
      maxHeight: style.maxHeight,
      contentEditable: element.getAttribute("contenteditable"),
    };
  });
}

async function expectAutoGrowingDescription(
  page: Page,
  description: Locator,
  value: string
): Promise<number> {
  await description.fill(value);
  await page.getByLabel("Line item quantity").locator("visible=true").first().focus();
  await expect(description).toContainText(value);

  const metrics = await readDescriptionMetrics(description);
  expect(metrics.contentEditable).toBe("true");
  expect(metrics.maxHeight).toBe("none");
  expect(metrics.overflowY).toBe("hidden");
  expect(metrics.styleHeight).toBeGreaterThan(0);
  expect(Math.abs(metrics.styleHeight - metrics.scrollHeight)).toBeLessThanOrEqual(2);
  expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.clientHeight + 1);
  return metrics.height;
}

async function expectTopAlignedLineItemControls(description: Locator): Promise<void> {
  const topOffsets = await description.evaluate((element) => {
    const row = element.closest<HTMLElement>(".eb-line-item-grid--pricing");
    if (!row) throw new Error("Estimate line-item grid is required");
    const selectors = [
      'input[aria-label="Line item title"]',
      'input[aria-label="Line item quantity"]',
      'input[aria-label="Line item unit"]',
      'input[aria-label="Line item unit price"]',
      ".eb-line-total-block",
      'button[aria-label="More actions"]',
    ];
    const rowTop = row.getBoundingClientRect().top;
    return selectors.map((selector) => {
      const node = row.querySelector<HTMLElement>(selector);
      if (!node) throw new Error(`Missing line-item control: ${selector}`);
      return Math.round(node.getBoundingClientRect().top - rowTop);
    });
  });

  expect(Math.max(...topOffsets) - Math.min(...topOffsets)).toBeLessThanOrEqual(2);
}

async function capture(page: Page, name: string): Promise<string> {
  const path = join(EVIDENCE_DIR, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  return path;
}

async function seedLongEstimate(): Promise<{
  estimateId: string;
  estimateNumber: string;
  hiddenLineTitle: string;
  itemTitles: string[];
  total: number;
}> {
  const admin = localAdmin();
  const estimateId = randomUUID();
  const estimateNumber = `LOCAL-READY-${Date.now()}`;
  const today = new Date().toISOString().slice(0, 10);
  const units = ["EA", "SF", "LF", "CY", "LS", "DAY"];
  const categories = Array.from({ length: 10 }, (_, sectionIndex) => ({
    estimate_id: estimateId,
    cost_code: `stress-${String(sectionIndex + 1).padStart(2, "0")}`,
    display_name: `Production Readiness Section ${sectionIndex + 1}`,
    order_index: sectionIndex,
  }));
  const hiddenLineTitle = "Coordination allowance with hidden customer amount";
  const longTitle =
    "Long section-transition line-item title that must wrap without detaching its customer-visible scope description";
  const standardBody =
    "Provide complete labor, material, equipment, supervision, protection, coordination, field verification, installation, inspections, cleanup, and closeout documentation for this realistic long-form construction scope. Coordinate interfaces with adjacent trades and maintain safe access throughout the work.";
  const itemBody = (ordinal: number): string => {
    if (ordinal === 18) {
      return [
        "Multi-paragraph scope introduction with field coordination, material protection, and verified installation sequencing.",
        "Second paragraph records inspection preparation, owner communication, and closeout documentation without omitting customer context.",
        "Third paragraph confirms handoff conditions, safe access, and the written Estimate boundary.",
      ].join("\n");
    }
    if (ordinal === 29) {
      return "<p>Bullet-list scope with real document structure.</p><ul><li>Coordinate procurement and field verification.</li><li>Protect completed work and adjacent finishes.</li><li>Document inspection and closeout conditions.</li></ul>";
    }
    if (ordinal === 41) {
      return "<p>Numbered construction sequence.</p><ol><li>Verify existing conditions before work starts.</li><li>Install and inspect the defined scope.</li><li>Record completion and client handoff.</li></ol>";
    }
    if (ordinal === 53) {
      return "Long single-item scope requires complete coordination, inspection, documentation, safe access, and closeout evidence before the client accepts the work. ".repeat(
        6
      );
    }
    return standardBody;
  };
  const items = categories.flatMap((section, sectionIndex) =>
    Array.from({ length: 6 }, (_, itemIndex) => {
      const ordinal = sectionIndex * 6 + itemIndex + 1;
      const qty = 4 + ((sectionIndex + itemIndex) % 9);
      const unitCost = 6_500 + sectionIndex * 1_350 + itemIndex * 725;
      const title =
        ordinal === 17
          ? hiddenLineTitle
          : ordinal === 23
            ? longTitle
            : `Construction scope line ${ordinal}`;
      return {
        estimate_id: estimateId,
        cost_code: section.cost_code,
        desc: `${title}\n${itemBody(ordinal)}`,
        qty,
        unit: units[(sectionIndex + itemIndex) % units.length],
        unit_cost: unitCost,
        markup_pct: 0,
        sort_order: ordinal - 1,
        status: ordinal % 13 === 0 ? "allowance" : "included",
        hide_amount_on_pdf: ordinal === 17,
      };
    })
  );
  const subtotal = items.reduce((sum, item) => sum + item.qty * item.unit_cost, 0);
  const tax = 74_250.37;
  const discount = 12_500.25;
  const total = subtotal + tax - discount;
  const milestonePercents = [0.1, 0.15, 0.2, 0.2, 0.2, 0.15];
  const milestones = milestonePercents.map((percent, index) => ({
    estimate_id: estimateId,
    title: `Operational milestone ${index + 1}`,
    description:
      "Release after field verification, coordinated procurement, completed installation, inspection acceptance, owner review, supporting documentation, and confirmation that preceding milestone conditions are satisfied. ".repeat(
        3
      ),
    amount: Number((total * percent).toFixed(2)),
    due_date: null,
    status: "draft",
    sort_order: index,
  }));

  const estimateInsert = await admin.from("estimates").insert({
    id: estimateId,
    number: estimateNumber,
    client: "[E2E] Production Readiness Customer",
    project: E2E_PRESERVED_PROJECT_LABEL,
    status: "Draft",
    updated_at: today,
    customer_id: E2E_PRESERVED_CUSTOMER_ID,
  });
  expect(estimateInsert.error).toBeNull();
  const metaInsert = await admin.from("estimate_meta").insert({
    estimate_id: estimateId,
    client_name: "[E2E] Production Readiness Customer",
    client_phone: "808-555-0199",
    client_email: "readiness@example.invalid",
    client_address: "800 Local Readiness Way",
    project_name: E2E_PRESERVED_PROJECT_LABEL,
    project_site_address: "800 Local Readiness Way",
    cost_category_names: { __hh: { documentStyle: "proposal" } },
    tax,
    discount,
    overhead_pct: 0,
    profit_pct: 0,
    estimate_date: today,
    valid_until: null,
    notes: "Deterministic local production-readiness stress Estimate.",
    sales_person: "Local QA",
    document_notes: [
      {
        id: randomUUID(),
        type: "assumptions",
        title: "Long-form coordination assumptions",
        body: "Pricing assumes normal weekday access, coordinated owner decisions, timely approvals, and unobstructed work areas. ".repeat(
          7
        ),
      },
      {
        id: randomUUID(),
        type: "clarifications",
        title: "Scope clarifications",
        body: "Final selections, concealed conditions, jurisdictional fees, and owner-requested changes remain subject to the existing written Estimate terms. ".repeat(
          5
        ),
      },
    ],
  });
  expect(metaInsert.error).toBeNull();
  expect((await admin.from("estimate_categories").insert(categories)).error).toBeNull();
  expect((await admin.from("estimate_items").insert(items)).error).toBeNull();
  expect((await admin.from("estimate_payment_schedule_items").insert(milestones)).error).toBeNull();
  createdEstimateIds.add(estimateId);
  return {
    estimateId,
    estimateNumber,
    hiddenLineTitle,
    itemTitles: items.map((item) => item.desc.split("\n", 1)[0]),
    total,
  };
}

test.beforeAll(async () => {
  await mkdir(EVIDENCE_DIR, { recursive: true });
});

test.afterAll(async () => {
  for (const estimateId of createdEstimateIds) await cleanupEstimateGraph(estimateId);
});

test("New Estimate persists an additional empty Section after Save and reload", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAsE2EOwner(page, "/estimates/new");
  await fillEstimateDetails(page, {
    clientName: `[E2E] Empty Section ${Date.now()}`,
    projectName: "[E2E] Empty Section Persistence",
    documentStyle: "proposal",
  });
  await addBlankSection(page);
  await addBlankSection(page);
  await page.getByLabel("Line item 1 title").locator("visible=true").fill("Persisted work item");
  await page.getByLabel("Line item 1 quantity").locator("visible=true").fill("1");
  await page.getByLabel("Line item 1 unit price").locator("visible=true").fill("1000");

  const secondSection = page.locator("[data-estimate-section-id]").nth(1);
  await secondSection.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Remove line item" }).click();
  await expect(secondSection.locator("[data-estimate-line-item-id]")).toHaveCount(0);
  await expect(page.getByLabel("Jump to section").locator("option").nth(1)).toContainText(
    "0 items"
  );

  await page.getByRole("button", { name: "Save Estimate" }).click();
  await expect(page).toHaveURL(/\/estimates\/(?!new(?:\/|$))[^/?#]+/, { timeout: 60_000 });
  const estimateId = page.url().match(/\/estimates\/([^/?#]+)/)?.[1];
  expect(estimateId).toBeTruthy();
  createdEstimateIds.add(estimateId!);

  const { data: persistedCategories, error: persistedCategoriesError } = await localAdmin()
    .from("estimate_categories")
    .select("cost_code, display_name, order_index")
    .eq("estimate_id", estimateId!)
    .order("order_index", { ascending: true });
  expect(persistedCategoriesError).toBeNull();
  expect(persistedCategories).toHaveLength(2);

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByLabel("Jump to section").locator("option")).toHaveCount(2);
  await expect(page.getByLabel("Jump to section").locator("option").nth(1)).toContainText(
    "0 items"
  );
});

test("60-line Estimate completes publication, continuity, revenue-readiness, and responsive stress", async ({
  page,
}) => {
  test.setTimeout(420_000);
  const { estimateId, estimateNumber, hiddenLineTitle, itemTitles, total } =
    await seedLongEstimate();
  const updatedTotal = total + (17_500 - (6_500 + 7 * 1_350)) * (4 + 7);
  const formattedUpdatedTotal = updatedTotal.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  await page.route("**/api/system-health", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"status":"warning"}' })
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAsE2EOwner(page, `/estimates/${estimateId}`);
  await expect(page.locator("main")).toContainText("Construction scope line 60", {
    timeout: 60_000,
  });
  await expect(page.locator("main")).toContainText(
    total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
  await expect(page.getByText(SYSTEM_WARNING_TEXT)).toHaveCount(0);
  await expect(
    page.locator('[data-app-topbar] button[aria-label="Notifications"] + span.bg-red-500')
  ).toHaveCount(1);

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const jumpToSection = page.getByLabel("Jump to section");
  await jumpToSection.selectOption({ label: "Production Readiness Section 8 · 6 items" });
  const selectedSection = page.locator('[data-estimate-section-id="stress-08"]');
  await expect(selectedSection).toBeFocused();
  const selectedPrice = selectedSection
    .locator('input[aria-label$="unit price"]')
    .locator("visible=true")
    .first();
  await selectedPrice.fill("17500");
  await selectedPrice.press("Tab");
  await page.getByRole("button", { name: "Save & Preview" }).first().click();
  await expect(page).toHaveURL(/\/preview\?.*returnSection=stress-08/, { timeout: 60_000 });
  const proposalDocument = page.getByTestId("estimate-document");
  await expect(proposalDocument).toContainText("Project Proposal");
  await expect(proposalDocument).toContainText("Luxury Design-Build Proposal");
  await expect(proposalDocument.getByTestId("estimate-preview-summary")).toContainText(
    "Contract Price"
  );
  await expect(proposalDocument.getByTestId("estimate-preview-summary")).toContainText(
    formattedUpdatedTotal
  );
  await capture(page, "proposal-preview-1440");

  await page.getByTestId("estimate-preview-back-link").click();
  await expect(page).toHaveURL(/returnSection=stress-08/);
  await expect(page.locator('[data-estimate-section-id="stress-08"]')).toBeFocused();
  await expect(page.locator('[data-estimate-section-id="stress-08"]')).toHaveClass(
    /eb-scope-section-current/
  );

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await fillEstimateDetails(page, {
    clientName: "[E2E] Production Readiness Customer",
    projectName: E2E_PRESERVED_PROJECT_LABEL,
    documentStyle: "itemized",
  });
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: "Save & Preview" }).first().click();
  await expect(page).toHaveURL(/\/preview/, { timeout: 60_000 });
  const itemizedDocument = page.getByTestId("estimate-document");
  await expect(itemizedDocument).toContainText("Itemized Estimate");
  await expect(itemizedDocument).toContainText("Detailed Construction Estimate");
  await expect(itemizedDocument).not.toContainText("Luxury Design-Build Proposal");
  await expect(itemizedDocument.getByTestId("estimate-preview-summary")).toContainText(
    "Grand Total"
  );
  await expect(itemizedDocument.getByTestId("estimate-preview-summary")).toContainText(
    formattedUpdatedTotal
  );
  await expect(itemizedDocument.getByTestId("estimate-line-item-output")).toHaveCount(60);
  expect(
    (
      await itemizedDocument
        .locator('[data-testid="estimate-line-item-output"] h4')
        .allTextContents()
    ).map((title) => title.trim())
  ).toEqual(itemTitles);
  await expect(itemizedDocument).toContainText("Multi-paragraph scope introduction");
  await expect(itemizedDocument).toContainText("Bullet-list scope with real document structure");
  await expect(itemizedDocument).toContainText("Numbered construction sequence");
  await expect(itemizedDocument).toContainText(
    "Long single-item scope requires complete coordination"
  );
  const hiddenLine = itemizedDocument
    .getByTestId("estimate-line-item-output")
    .filter({ hasText: hiddenLineTitle });
  await expect(hiddenLine.getByTestId("estimate-line-item-total")).toHaveText("—");

  const previewPages = itemizedDocument.getByTestId("estimate-preview-page");
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
  await expectBoundedLetterPages(previewPages);
  await expect(previewPages.nth(1)).toContainText(estimateNumber);
  await expect(previewPages.nth(1)).toContainText(`Page 2 of ${previewPageCount}`);
  const paymentPages = itemizedDocument.locator('[data-final-packet-part^="payment"]');
  expect(await paymentPages.count()).toBeGreaterThan(1);
  for (const paymentPage of await paymentPages.all()) {
    await expect(paymentPage).toContainText("Payment Schedule");
  }
  await expect(itemizedDocument.locator(".estimate-payment-row")).toHaveCount(6);
  await expect(itemizedDocument).toContainText("Notes & Clarifications");
  await expect(itemizedDocument).toContainText("Client Acceptance");

  const printPagePromise = page.context().waitForEvent("page");
  await page.getByRole("link", { name: "Print", exact: true }).click();
  const printPage = await printPagePromise;
  await printPage.waitForLoadState("domcontentloaded");
  const printDocument = printPage.getByTestId("estimate-document");
  await expect(printDocument).toContainText("Itemized Estimate");
  await expect(printDocument).toContainText("Payment Schedule");
  await expect(printDocument).toContainText("Notes & Clarifications");
  await expect(printDocument).toContainText("Client Acceptance");
  await expect(printDocument).toContainText(`Page 2 of ${previewPageCount}`);
  expect(await printDocument.getByTestId("estimate-preview-page").count()).toBe(previewPageCount);
  await printPage.close();

  const pdfResponse = await page.request.get(`/api/estimates/${estimateId}/pdf`);
  expect(pdfResponse.status()).toBe(200);
  const pdf = await pdfResponse.body();
  expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  const pdfPageCount = pdf.toString("latin1").match(/\/Type\s*\/Page\b/g)?.length ?? 0;
  expect(pdfPageCount).toBe(previewPageCount);
  await writeFile(join(EVIDENCE_DIR, "long-estimate-itemized.pdf"), pdf);
  await capture(page, "itemized-preview-1440");

  await page.getByTestId("estimate-preview-back-link").click();
  await expect(page.getByTestId("estimate-invoice-readiness")).toContainText(estimateNumber);
  await expect(page.getByTestId("estimate-invoice-readiness")).toContainText(
    "[E2E] Production Readiness Customer"
  );
  await expect(page.getByTestId("estimate-invoice-readiness")).toContainText(
    E2E_PRESERVED_PROJECT_LABEL
  );
  await expect(page.getByRole("link", { name: "Create Draft Invoice" })).toHaveCount(6);
  await expect(page.getByRole("link", { name: "Create Draft Invoice" }).first()).toHaveAttribute(
    "href",
    /\/financial\/invoices\/new\?.*returnTo=/
  );

  const viewports = [
    { name: "desktop-1440", width: 1440, height: 900 },
    { name: "desktop-1280", width: 1280, height: 850 },
    { name: "ipad-landscape", width: 1180, height: 820 },
    { name: "ipad-portrait", width: 820, height: 1180 },
    { name: "mobile-390", width: 390, height: 844 },
  ];
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(`/estimates/${estimateId}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expectNoHorizontalOverflow(page);
    await expect(page.getByText(SYSTEM_WARNING_TEXT)).toHaveCount(0);

    if (viewport.width < 1024) {
      const stickyActions = page.getByLabel("Estimate edit actions");
      await expect(stickyActions).toBeVisible();
      const stickyBox = await stickyActions.boundingBox();
      expect(stickyBox).not.toBeNull();
      expect(stickyBox!.height).toBeLessThanOrEqual(136);
      const save = stickyActions.getByRole("button", { name: "Save", exact: true });
      const saveBox = await save.boundingBox();
      expect(saveBox?.height).toBeGreaterThanOrEqual(44);
    } else {
      await expect(page.getByLabel("Estimate edit actions")).toBeHidden();
    }

    if (viewport.width >= 1024) {
      const description = page.getByLabel("Line item description").locator("visible=true").first();
      await description.scrollIntoViewIfNeeded();
      if (viewport.name === "desktop-1440") {
        const shortDescription = "Protect adjacent finishes.";
        const mediumDescription =
          "Coordinate material staging, site protection, field verification, and final closeout documentation.";
        const longDescription =
          "Protect adjacent occupied finishes, coordinate daily access with the owner, maintain dust control and safe egress, and include all temporary protection, cleanup, adjustments, and closeout documentation required for a complete scope.";

        const shortHeight = await expectAutoGrowingDescription(page, description, shortDescription);
        const mediumHeight = await expectAutoGrowingDescription(
          page,
          description,
          mediumDescription
        );
        const longHeight = await expectAutoGrowingDescription(page, description, longDescription);

        expect(shortHeight).toBeLessThan(mediumHeight);
        expect(mediumHeight).toBeLessThan(longHeight);
        await expectTopAlignedLineItemControls(description);
      } else {
        await expectAutoGrowingDescription(
          page,
          description,
          "Coordinate material staging, site protection, field verification, and final closeout documentation."
        );
        await expect(
          page.getByLabel("Line item quantity").locator("visible=true").first()
        ).toBeVisible();
        await expect(
          page.getByLabel("Line item unit price").locator("visible=true").first()
        ).toBeVisible();
      }
    } else if (viewport.width === 390) {
      await expect(page.getByTestId("estimate-line-item-grid-header").first()).toBeHidden();
      await expect(
        page.locator("[data-estimate-section-mobile-id] [data-estimate-line-item-id]").first()
      ).toBeVisible();
    }

    await capture(page, `builder-${viewport.name}`);
    await page
      .getByRole("button", { name: "Done", exact: true })
      .locator("visible=true")
      .first()
      .click();
    await page.goto(`/estimates/${estimateId}/preview`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("estimate-document")).toBeVisible({ timeout: 60_000 });
    await expectNoHorizontalOverflow(page);
    await expect(page.getByRole("link", { name: "Download PDF" })).toBeVisible();
    if (viewport.width <= 700) {
      await page.getByRole("button", { name: "More preview actions" }).click();
      const printMenuItem = page.getByRole("menuitem", { name: "Print", exact: true });
      await expect(printMenuItem).toBeVisible();
      await expect(printMenuItem).toHaveAttribute("href", /\/print/);
      await page.keyboard.press("Escape");
    } else {
      await expect(page.getByRole("link", { name: "Print", exact: true })).toBeVisible();
    }
  }
});
