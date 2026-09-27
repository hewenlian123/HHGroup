import postgres, { type Sql } from "postgres";
import { createClient } from "@supabase/supabase-js";
import { deleteEstimateSectionWithSql } from "../src/lib/estimates-db";

function localDb(customFetch?: typeof fetch) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname))
    throw new Error("Local Supabase required");
  return createClient(
    url,
    (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)!,
    {
      global: customFetch ? { fetch: customFetch } : undefined,
    }
  );
}
async function clearFixtureSchedule() {
  // Successful deletion fixture has no precommitted payment obligations.
  const { error } = await localDb()
    .from("estimate_payment_schedule_items")
    .delete()
    .eq("estimate_id", ESTIMATE_FINANCIAL_FIXTURE_ID);
  expect(error).toBeNull();
}
import { expect, test } from "./estimate-playwright-test";
import { loginAsE2EOwner, reloadWithE2EAuth } from "./e2e-auth-owner";
import {
  seedEstimateFinancialFixture,
  cleanupEstimateFinancialFixture,
  ESTIMATE_FINANCIAL_FIXTURE_ID,
} from "./estimate-financial-fixture";

test.use({ actionTimeout: 10_000 });

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
]) {
  test(`section deletion persists and recalculates at ${viewport.width}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    await seedEstimateFinancialFixture();
    try {
      await clearFixtureSchedule();
      await page.setViewportSize(viewport);
      await loginAsE2EOwner(page, `/estimates/${ESTIMATE_FINANCIAL_FIXTURE_ID}`);
      const header = page.getByTestId("estimate-detail-header");
      await header.getByRole("button", { name: "Edit", exact: true }).click();
      const section = page.locator('[data-estimate-section-id="010000"]');
      const summary = page.getByRole("region", { name: "Estimate pricing summary" });
      await expect(summary).toContainText("$961.26");
      await section.getByRole("button", { name: "Delete section", exact: true }).click();
      const confirm = page.getByRole("dialog", { name: "Delete section?", exact: true });
      await expect(confirm).toContainText("Delete this section and all items inside?");
      await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(section).toBeVisible();
      await expect(summary).toContainText("$961.26");
      await section.getByRole("button", { name: "Delete section", exact: true }).click();
      await confirm.getByRole("button", { name: "Confirm", exact: true }).click();
      await expect(section).toHaveCount(0);
      await expect(summary).toContainText("$541.25");
      await expect(header).toContainText("Saved");
      await reloadWithE2EAuth(page);
      await expect(section).toHaveCount(0);
      await expect(summary).toContainText("$541.25");
      await expect(page.locator("[data-estimate-line-item-id]:visible")).toHaveCount(1);
      await header.getByRole("button", { name: "Edit", exact: true }).click();
      const remaining = page.locator('[data-estimate-section-id="020000"]');
      await remaining.getByRole("button", { name: "Collapse section", exact: true }).click();
      await expect(
        remaining.getByRole("button", { name: "Expand section", exact: true })
      ).toBeVisible();
      await remaining.getByRole("button", { name: "Expand section", exact: true }).click();
      await expect(
        remaining.getByRole("button", { name: "Reorder section", exact: true })
      ).toBeVisible();
      const { error: emptyError } = await localDb().from("estimate_categories").insert({
        estimate_id: ESTIMATE_FINANCIAL_FIXTURE_ID,
        cost_code: "empty-delete",
        display_name: "PW Empty section",
        order_index: 2,
      });
      expect(emptyError).toBeNull();
      await reloadWithE2EAuth(page);
      await header.getByRole("button", { name: "Edit", exact: true }).click();
      const blankCode = "empty-delete";
      const blank = page.locator(`[data-estimate-section-id="${blankCode}"]`);
      await expect(blank).toContainText("No items");
      await blank.getByRole("button", { name: "Delete section", exact: true }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page.locator(`[data-estimate-section-id="${blankCode}"]`)).toHaveCount(0);
      await expect(header).toContainText("Saved");
      await reloadWithE2EAuth(page);
      await expect(page.locator(`[data-estimate-section-id="${blankCode}"]`)).toHaveCount(0);
      await expect(summary).toContainText("$541.25");
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`delete-${viewport.width}.png`),
        fullPage: true,
      });
    } finally {
      await cleanupEstimateFinancialFixture();
    }
  });
}

for (const failure of ["items", "category", "after category", "payment constraint"] as const) {
  test(`failed section deletion preserves records: ${failure}`, async () => {
    await seedEstimateFinancialFixture();
    const db = localDb();
    const databaseUrl = process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;
    if (!databaseUrl || !["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname))
      throw new Error("Local DB connection required");
    const sql = postgres(databaseUrl, { max: 1 });
    try {
      if (failure !== "payment constraint") await clearFixtureSchedule();
      const read = async () => {
        const [items, categories] = await Promise.all([
          db
            .from("estimate_items")
            .select("*")
            .eq("estimate_id", ESTIMATE_FINANCIAL_FIXTURE_ID)
            .order("id"),
          db
            .from("estimate_categories")
            .select("*")
            .eq("estimate_id", ESTIMATE_FINANCIAL_FIXTURE_ID)
            .order("cost_code"),
        ]);
        expect(items.error).toBeNull();
        expect(categories.error).toBeNull();
        return { items: items.data, categories: categories.data };
      };
      const before = await read();
      let injected = false;
      // Throw inside the actual transaction, after earlier statements have really executed.
      const faultSql = new Proxy(sql, {
        get(target, property) {
          if (property !== "begin") return Reflect.get(target, property);
          return (callback: (transaction: unknown) => Promise<void>) =>
            sql.begin(async (transaction) => {
              const intercepted = new Proxy(transaction, {
                get(query, property) {
                  if (property !== "unsafe") return Reflect.get(query, property);
                  return (statement: string, parameters: string[]) => {
                    const match =
                      failure === "items"
                        ? "delete from public.estimate_items"
                        : failure === "category"
                          ? "delete from public.estimate_categories"
                          : "update public.estimates";
                    if (failure !== "payment constraint" && statement.includes(match)) {
                      injected = true;
                      throw new Error("Injected transaction failure");
                    }
                    return query.unsafe(statement, parameters);
                  };
                },
              });
              return callback(intercepted);
            });
        },
      }) as Sql;
      await expect(
        deleteEstimateSectionWithSql(faultSql, ESTIMATE_FINANCIAL_FIXTURE_ID, "010000")
      ).rejects.toBeTruthy();
      expect(await read()).toEqual(before);
      if (failure !== "payment constraint") expect(injected).toBe(true);
      await clearFixtureSchedule();
      await deleteEstimateSectionWithSql(sql, ESTIMATE_FINANCIAL_FIXTURE_ID, "010000");
      await deleteEstimateSectionWithSql(sql, ESTIMATE_FINANCIAL_FIXTURE_ID, "010000");
      const after = await read();
      expect(after.items).toHaveLength(1);
      expect(after.categories).toHaveLength(1);
    } finally {
      await sql.end();
      await cleanupEstimateFinancialFixture();
    }
  });
}

test("payment protection explains failure and the same deletion can be retried", async ({
  page,
}) => {
  await seedEstimateFinancialFixture();
  try {
    await clearFixtureSchedule();
    const { error } = await localDb().from("estimate_payment_schedule_items").insert({
      estimate_id: ESTIMATE_FINANCIAL_FIXTURE_ID,
      title: "Retry payment",
      amount: 961.26,
      status: "draft",
      sort_order: 0,
    });
    expect(error).toBeNull();
    await loginAsE2EOwner(page, `/estimates/${ESTIMATE_FINANCIAL_FIXTURE_ID}`);
    await page
      .getByTestId("estimate-detail-header")
      .getByRole("button", { name: "Edit", exact: true })
      .click();
    const section = page.locator('[data-estimate-section-id="010000"]');
    await section.getByRole("button", { name: "Delete section", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Delete section?", exact: true });
    await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("Adjust the Payment Schedule");
    await expect(section).toHaveCount(1);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByRole("region", { name: "Estimate pricing summary" })).toContainText(
      "$961.26"
    );
    await page.locator('summary[aria-label="Actions for Retry payment"]').click();
    await page.getByRole("button", { name: "Delete Retry payment", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Delete Retry payment", exact: true })
    ).toHaveCount(0);
    await section.getByRole("button", { name: "Delete section", exact: true }).click();
    await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(section).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Estimate pricing summary" })).toContainText(
      "$541.25"
    );
  } finally {
    await cleanupEstimateFinancialFixture();
  }
});

test("new draft section deletion clears local items and totals", async ({ page }) => {
  await loginAsE2EOwner(page, "/estimates/new");
  await page.getByRole("button", { name: "Add Section", exact: true }).first().click();
  await page.getByRole("menuitem", { name: "Blank section", exact: true }).click();
  const section = page.locator("[data-estimate-section-id]").first();
  await page.getByLabel("Line item 1 title").locator("visible=true").fill("Delete draft item");
  await page
    .getByLabel("Line item 1 unit price", { exact: true })
    .locator("visible=true")
    .fill("250");
  await page
    .getByLabel("Line item 1 unit price", { exact: true })
    .locator("visible=true")
    .press("Tab");
  await expect(page.getByRole("region", { name: "Estimate pricing summary" })).toContainText(
    "$250.00"
  );
  await section.getByRole("button", { name: "Delete section", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Delete section?", exact: true });
  await expect(dialog).toContainText("Delete this section and all items inside?");
  await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.locator("[data-estimate-section-id]")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Estimate pricing summary" })).toContainText(
    "$0.00"
  );
});
