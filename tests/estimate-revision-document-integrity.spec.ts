import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { loginAsE2EOwner } from "./e2e-auth-owner";
import { expectBoundedLetterPages } from "./estimate-document-page-integrity";
import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";

const EVIDENCE_DIR = "/private/tmp/hh-estimate-phase3b";

function localAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Local Supabase service role is required for this test.");
  assertE2ESupabaseUrlSafeForMutations(url);
  return createClient(url, key, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

function longScope(label: string, index: number): string {
  return `${label} scope item ${index + 1}\n${"Coordinate field verification, protected installation, inspection, documentation, and closeout. ".repeat(
    4
  )}`;
}

function pdfText(pdf: Buffer): string {
  return execFileSync("pdftotext", ["-layout", "-", "-"], {
    encoding: "utf8",
    input: pdf,
    maxBuffer: 10 * 1024 * 1024,
  });
}

test("immutable revisions keep selected Preview, Print, and PDF identity and content", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const db = localAdmin();
  const suffix = Date.now();
  const sourceId = randomUUID();
  const estimateNumber = `EST-P3B-${suffix}`;
  const customerId = randomUUID();
  let revisionId = "";
  const runtimeErrors: string[] = [];
  const failedResponses: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 500) failedResponses.push(`${response.status()} ${response.url()}`);
  });

  try {
    await mkdir(EVIDENCE_DIR, { recursive: true });
    const customer = await db.from("customers").insert({
      id: customerId,
      name: `P3B Customer ${suffix}`,
      email: `p3b-${suffix}@example.test`,
      phone: "808-555-0330",
      address: "30 Historical Way",
    });
    if (customer.error) throw new Error(customer.error.message);

    const source = await db.from("estimates").insert({
      id: sourceId,
      number: estimateNumber,
      client: `Rev 0 Customer ${suffix}`,
      project: `Rev 0 Project ${suffix}`,
      status: "Approved",
      approved_at: "2025-01-02",
      customer_id: customerId,
    });
    if (source.error) throw new Error(source.error.message);

    const meta = await db.from("estimate_meta").insert({
      estimate_id: sourceId,
      client_name: `Rev 0 Customer ${suffix}`,
      client_email: `p3b-${suffix}@example.test`,
      client_phone: "808-555-0330",
      client_address: "30 Historical Way",
      project_name: `Rev 0 Project ${suffix}`,
      project_site_address: "30 Historical Way",
      cost_category_names: { __hh: { documentStyle: "proposal" } },
      tax: 210,
      discount: 10,
      overhead_pct: 0,
      profit_pct: 0,
      estimate_date: "2025-01-02",
      valid_until: "2025-03-02",
      notes: "Rev 0 internal note",
      document_notes: [
        {
          id: "rev-0-terms",
          type: "payment_terms",
          title: "Rev 0 terms",
          body: "Rev 0 historical customer terms remain fixed.",
        },
      ],
    });
    if (meta.error) throw new Error(meta.error.message);

    const categories = await db.from("estimate_categories").insert([
      {
        estimate_id: sourceId,
        cost_code: "010000",
        display_name: "Rev 0 Preconstruction",
        order_index: 0,
      },
      {
        estimate_id: sourceId,
        cost_code: "020000",
        display_name: "Rev 0 Construction",
        order_index: 1,
      },
    ]);
    if (categories.error) throw new Error(categories.error.message);

    const items = await db.from("estimate_items").insert(
      Array.from({ length: 12 }, (_, index) => ({
        estimate_id: sourceId,
        cost_code: index < 6 ? "010000" : "020000",
        desc: longScope("REV0-ONLY", index),
        qty: 1,
        unit: "EA",
        unit_cost: index === 0 ? 1_000 : 100,
        markup_pct: 0,
        status: index === 0 ? "owner_supplied" : "included",
        hide_amount_on_pdf: index === 0,
        sort_order: index,
      }))
    );
    if (items.error) throw new Error(items.error.message);

    const schedule = await db.from("estimate_payment_schedule_items").insert([
      {
        estimate_id: sourceId,
        title: "Rev 0 deposit",
        description: "Historical tax-inclusive deposit",
        amount: 1_000,
        due_date: "2025-01-10",
        status: "draft",
        invoice_id: null,
        sort_order: 0,
      },
      {
        estimate_id: sourceId,
        title: "Rev 0 completion",
        description: "Historical tax-inclusive completion",
        amount: 1_300,
        due_date: "2025-02-10",
        status: "draft",
        invoice_id: null,
        sort_order: 1,
      },
    ]);
    if (schedule.error) throw new Error(schedule.error.message);

    const created = await db.rpc("create_estimate_revision", {
      p_source_estimate_id: sourceId,
    });
    if (created.error) throw new Error(created.error.message);
    const createdRow = Array.isArray(created.data) ? created.data[0] : created.data;
    revisionId = String(createdRow?.estimate_id ?? "");
    if (!revisionId) throw new Error("Revision RPC did not return an Estimate id.");

    const revisionHeader = await db
      .from("estimates")
      .update({ client: `Rev 1 Customer ${suffix}`, project: `Rev 1 Project ${suffix}` })
      .eq("id", revisionId);
    if (revisionHeader.error) throw new Error(revisionHeader.error.message);
    const revisionMeta = await db
      .from("estimate_meta")
      .update({
        client_name: `Rev 1 Customer ${suffix}`,
        client_address: "31 Current Way",
        project_name: `Rev 1 Project ${suffix}`,
        project_site_address: "31 Current Way",
        cost_category_names: { __hh: { documentStyle: "itemized" } },
        tax: 330,
        discount: 30,
        notes: "Rev 1 internal note",
        document_notes: [
          {
            id: "rev-1-terms",
            type: "payment_terms",
            title: "Rev 1 terms",
            body: "Rev 1 current customer terms are distinct.",
          },
        ],
      })
      .eq("estimate_id", revisionId);
    if (revisionMeta.error) throw new Error(revisionMeta.error.message);
    const revisionFirstItem = await db
      .from("estimate_items")
      .update({ desc: longScope("REV1-ONLY", 0), unit_cost: 2_000 })
      .eq("estimate_id", revisionId)
      .eq("sort_order", 0);
    if (revisionFirstItem.error) throw new Error(revisionFirstItem.error.message);
    const revisionCategory = await db
      .from("estimate_categories")
      .update({ display_name: "Rev 1 Preconstruction" })
      .eq("estimate_id", revisionId)
      .eq("cost_code", "010000");
    if (revisionCategory.error) throw new Error(revisionCategory.error.message);
    const copiedSchedule = await db
      .from("estimate_payment_schedule_items")
      .select("id, sort_order")
      .eq("estimate_id", revisionId)
      .order("sort_order");
    if (copiedSchedule.error || copiedSchedule.data?.length !== 2) {
      throw new Error(copiedSchedule.error?.message ?? "Revision schedule was not copied.");
    }
    const scheduleUpdates = [
      {
        title: "Rev 1 deposit",
        description: "Current tax-inclusive deposit",
        amount: 1_200,
      },
      {
        title: "Rev 1 completion",
        description: "Current tax-inclusive completion",
        amount: 1_800,
      },
    ];
    for (const [index, row] of copiedSchedule.data.entries()) {
      const revisionSchedule = await db
        .from("estimate_payment_schedule_items")
        .update({ ...scheduleUpdates[index], due_date: null, status: "draft", invoice_id: null })
        .eq("id", row.id)
        .eq("estimate_id", revisionId);
      if (revisionSchedule.error) throw new Error(revisionSchedule.error.message);
    }

    await page.setViewportSize({ width: 1440, height: 1000 });
    await loginAsE2EOwner(page, `/estimates/${sourceId}/preview`);

    const sourceDocument = page.getByTestId("estimate-document");
    await expect(sourceDocument).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("estimate-preview-context")).toContainText(
      `${estimateNumber} Rev 0`
    );
    await expect(page.getByTestId("estimate-revision-context")).toContainText(
      "Historical revision · Read-only"
    );
    await expect(sourceDocument).toHaveAttribute("data-estimate-document-style", "proposal");
    await expect(sourceDocument).toContainText(`Rev 0 Customer ${suffix}`);
    await expect(sourceDocument).toContainText(`Rev 0 Project ${suffix}`);
    await expect(sourceDocument).toContainText("REV0-ONLY scope item 1");
    await expect(sourceDocument).not.toContainText("REV1-ONLY scope item 1");
    await expect(sourceDocument).toContainText("Rev 0 Preconstruction");
    await expect(sourceDocument.getByTestId("estimate-line-item-output").first()).toContainText(
      "REV0-ONLY scope item 1"
    );
    await expect(sourceDocument).toContainText("Rev 0 terms");
    await expect(sourceDocument).toContainText("Rev 0 deposit");
    await expect(sourceDocument.locator(".estimate-payment-row").first()).toContainText(
      "$1,000.00"
    );
    const sourceSummary = sourceDocument.getByTestId("estimate-preview-summary");
    await expect(sourceSummary).toContainText("$210.00");
    await expect(sourceSummary).toContainText("$10.00");
    await expect(sourceSummary).toContainText("$2,300.00");
    const sourcePages = sourceDocument.getByTestId("estimate-preview-page");
    await expect.poll(() => sourcePages.count()).toBeGreaterThan(1);
    await expectBoundedLetterPages(sourcePages);
    await page.screenshot({
      path: `${EVIDENCE_DIR}/historical-preview-desktop.png`,
      fullPage: false,
    });

    await page.getByRole("link", { name: "Next revision", exact: true }).first().click();
    await expect(page).toHaveURL(new RegExp(`/estimates/${revisionId}/preview$`));
    const revisionDocument = page.getByTestId("estimate-document");
    await expect(page.getByTestId("estimate-preview-context")).toContainText(
      `${estimateNumber} Rev 1`
    );
    await expect(page.getByTestId("estimate-revision-context")).toContainText("Current revision");
    await expect(revisionDocument).toHaveAttribute("data-estimate-document-style", "itemized");
    await expect(revisionDocument).toContainText(`Rev 1 Customer ${suffix}`);
    await expect(revisionDocument).toContainText(`Rev 1 Project ${suffix}`);
    await expect(revisionDocument).toContainText("REV1-ONLY scope item 1");
    await expect(
      revisionDocument.getByRole("heading", { name: "REV0-ONLY scope item 1", exact: true })
    ).toHaveCount(0);
    await expect(revisionDocument).toContainText("Rev 1 Preconstruction");
    const revisionFirstLine = revisionDocument.getByTestId("estimate-line-item-output").first();
    await expect(revisionFirstLine).toContainText("REV1-ONLY scope item 1");
    await expect(revisionFirstLine).toContainText("Owner supplied");
    await expect(revisionFirstLine).toContainText("Qty 1 · EA");
    await expect(revisionFirstLine.getByTestId("estimate-line-item-total")).toHaveText("—");
    await expect(revisionFirstLine.getByTestId("estimate-line-item-unit-price")).toHaveText(
      "Unit —"
    );
    await expect(revisionDocument).toContainText("Rev 1 terms");
    await expect(revisionDocument).toContainText("Rev 1 deposit");
    await expect(revisionDocument.locator(".estimate-payment-row").first()).toContainText(
      "$1,200.00"
    );
    const revisionSummary = revisionDocument.getByTestId("estimate-preview-summary");
    await expect(revisionSummary).toContainText("$330.00");
    await expect(revisionSummary).toContainText("$30.00");
    await expect(revisionSummary).toContainText("$3,400.00");
    await expectBoundedLetterPages(revisionDocument.getByTestId("estimate-preview-page"));

    for (const fixture of [
      {
        id: sourceId,
        revision: 0,
        style: "proposal",
        ownText: "REV0-ONLY scope item 1",
        otherText: "REV1-ONLY scope item 1",
        total: "$2,300.00",
        schedule: "Rev 0 deposit",
      },
      {
        id: revisionId,
        revision: 1,
        style: "itemized",
        ownText: "REV1-ONLY scope item 1",
        otherText: "REV0-ONLY scope item 1",
        total: "$3,400.00",
        schedule: "Rev 1 deposit",
      },
    ]) {
      await page.goto(`/estimates/${fixture.id}/print`, { waitUntil: "domcontentloaded" });
      await expect(page.locator(".estimate-print-context-identity")).toHaveText(
        `${estimateNumber} Rev ${fixture.revision}`
      );
      const printDocument = page.getByTestId("estimate-document");
      await expect(printDocument).toHaveAttribute("data-estimate-document-style", fixture.style);
      await expect(printDocument).toContainText(fixture.ownText);
      await expect(
        printDocument.getByRole("heading", { name: fixture.otherText, exact: true })
      ).toHaveCount(0);
      await expect(printDocument).toContainText(fixture.total);
      await expect(printDocument).toContainText(fixture.schedule);

      const pdfResponse = await page.request.get(`/api/estimates/${fixture.id}/pdf`);
      expect(pdfResponse.status()).toBe(200);
      expect(pdfResponse.headers()["content-disposition"]).toContain(
        `${estimateNumber}_Rev_${fixture.revision}.pdf`
      );
      const pdf = await pdfResponse.body();
      expect(pdf.subarray(0, 4).toString("utf8")).toBe("%PDF");
      expect(pdf.toString("latin1").match(/\/Type\s*\/Page\b/g)?.length ?? 0).toBeGreaterThan(1);
      await writeFile(`${EVIDENCE_DIR}/rev-${fixture.revision}.pdf`, pdf);
      const text = pdfText(pdf);
      expect(text).toContain(`${estimateNumber} Rev ${fixture.revision}`);
      expect(text).toContain(fixture.ownText);
      expect(text).not.toMatch(new RegExp(`${fixture.otherText}(?!\\d)`));
      expect(text).toContain(fixture.total);
      expect(text).toContain(fixture.schedule);
    }

    await page.goto(`/estimates/${sourceId}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Current revision", exact: true })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/estimates/${sourceId}/preview`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("estimate-revision-context")).toBeVisible();
    await page.getByRole("button", { name: "More preview actions" }).click();
    await expect(page.getByRole("menuitem", { name: "Next revision" })).toBeVisible();
    await page.screenshot({
      path: `${EVIDENCE_DIR}/historical-preview-mobile.png`,
      fullPage: false,
    });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
    expect(runtimeErrors).toEqual([]);
    expect(failedResponses).toEqual([]);
  } finally {
    const estimateIds = [revisionId, sourceId].filter(Boolean);
    if (estimateIds.length > 0) {
      await db.from("estimate_payment_schedule_items").delete().in("estimate_id", estimateIds);
      await db.from("estimate_items").delete().in("estimate_id", estimateIds);
      await db.from("estimate_categories").delete().in("estimate_id", estimateIds);
      await db.from("estimate_meta").delete().in("estimate_id", estimateIds);
      if (revisionId) await db.from("estimates").delete().eq("id", revisionId);
      await db.from("estimates").delete().eq("id", sourceId);
    }
    await db.from("customers").delete().eq("id", customerId);
  }
});
