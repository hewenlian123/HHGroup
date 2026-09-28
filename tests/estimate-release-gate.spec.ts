import { expect, test } from "./estimate-playwright-test";
import { loginAsE2EOwner, reloadWithE2EAuth } from "./e2e-auth-owner";
import { createClient } from "@supabase/supabase-js";
import { deleteLocalEstimateFixtureGraphs } from "./e2e-estimate-fixture-teardown";

test.use({ actionTimeout: 10_000 });

test("RC New/Saved inline descriptions, notes, payments, summary, reload and PDF", async ({
  page,
}) => {
  test.setTimeout(240_000);
  expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toMatch(/:55321$/);
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  let id: string | undefined;
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await loginAsE2EOwner(page, "/estimates/new");
    await page.getByRole("button", { name: "Estimate details", exact: true }).click();
    const details = page.getByRole("dialog");
    await details.getByPlaceholder("Client or company name").fill("PW RC Customer");
    await details.getByPlaceholder("Project name").fill("PW RC Estimate Gate");
    await details.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("button", { name: "Add Section", exact: true }).first().click();
    await page.getByRole("menuitem", { name: "Blank section", exact: true }).click();
    await page
      .getByLabel("Line item 1 title", { exact: true })
      .filter({ visible: true })
      .fill("PW Concrete Slab");
    const description = page
      .getByRole("textbox", { name: "Line item 1 description", exact: true })
      .filter({ visible: true });
    await description.fill("Reinforced slab detail");
    await description.press("Meta+a");
    await page.getByRole("button", { name: "Bold", exact: true }).click();
    await expect
      .poll(() => description.evaluate((element) => element.innerHTML))
      .toMatch(/<(b|strong)>/);
    await page
      .getByLabel("Line item 1 quantity", { exact: true })
      .filter({ visible: true })
      .fill("12");
    await page
      .getByLabel("Line item 1 unit price", { exact: true })
      .filter({ visible: true })
      .fill("100");
    await page.getByRole("button", { name: "Add Customer Note", exact: true }).click();
    await page.getByLabel("Note title", { exact: true }).fill("Exclusions");
    const note = page.locator('#estimate-customer-notes [contenteditable="true"]');
    await note.fill("Painting excluded");
    await note.press("Meta+Enter");
    const payments = page.locator("#estimate-payment-schedule");
    await payments.getByRole("button", { name: "Add Payment", exact: true }).click();
    await payments.getByLabel("Milestone name", { exact: true }).fill("Deposit");
    await expect(payments).toContainText("Upon Completion");
    await payments.locator(".estimate-payment-value-display").click();
    await payments.getByLabel("Percentage", { exact: true }).fill("20");
    await payments.getByLabel("Milestone name", { exact: true }).click();
    await expect(payments).toContainText("$240.00");
    await payments.getByRole("button", { name: "Payment due", exact: true }).click();
    await page.getByRole("menuitemradio", { name: "Specific Date", exact: true }).click();
    await payments.getByLabel("Payment due date", { exact: true }).fill("2027-01-08");
    await payments.getByLabel("Milestone name", { exact: true }).click();
    await payments.locator("summary").filter({ hasText: "Add note" }).click();
    await payments
      .getByRole("textbox", { name: "Payment note", exact: true })
      .fill("Inspection approval");
    await payments.getByRole("textbox", { name: "Payment note", exact: true }).press("Meta+Enter");
    await page
      .getByRole("button", { name: "Save Estimate", exact: true })
      .filter({ visible: true })
      .first()
      .click();
    await expect(page).toHaveURL(/\/estimates\/[0-9a-f-]{36}/, { timeout: 45_000 });
    id = page.url().match(/\/estimates\/([0-9a-f-]{36})/)![1];
    await reloadWithE2EAuth(page);
    await page
      .getByTestId("estimate-detail-header")
      .getByRole("button", { name: "Edit", exact: true })
      .click();
    const quantity = page
      .getByLabel("Line item quantity", { exact: true })
      .filter({ visible: true });
    for (const value of ["13", "14", "15"]) await quantity.fill(value);
    await quantity.press("Tab");
    await expect
      .poll(
        async () =>
          (await db.from("estimate_items").select("qty").eq("estimate_id", id!).single()).data?.qty
      )
      .toBe(15);
    await reloadWithE2EAuth(page);
    await page
      .getByTestId("estimate-detail-header")
      .getByRole("button", { name: "Edit", exact: true })
      .click();
    await expect(quantity).toHaveValue("15");
    const title = page.getByLabel("Line item title", { exact: true }).filter({ visible: true });
    await expect(title).toHaveValue("PW Concrete Slab");
    const items = await db
      .from("estimate_items")
      .select("id,item_name,desc,qty")
      .eq("estimate_id", id);
    expect(items.error).toBeNull();
    expect(items.data![0].item_name).toBe("PW Concrete Slab");
    expect(items.data![0].desc).toMatch(/Reinforced slab detail/);
    const milestone = await db
      .from("estimate_payment_schedule_items")
      .select("id,description,amount,due_date")
      .eq("estimate_id", id)
      .single();
    expect(milestone.error).toBeNull();
    expect(milestone.data!.amount).toBe(240);
    expect(milestone.data!.due_date).toBe("2027-01-08");
    expect(milestone.data!.description).toContain("Inspection approval");
    const term = await db
      .from("estimate_payment_schedule_items")
      .update({ payment_term: "Upon Completion" })
      .eq("id", milestone.data!.id)
      .select("payment_term")
      .single();
    expect(term.error).toBeNull();
    expect(term.data!.payment_term).toBe("Upon Completion");
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect(title).toBeVisible();
      await title.fill("PW Concrete Slab");
      await title.press("Tab");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      );
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect(page.getByRole("region", { name: "Estimate pricing summary" })).toContainText(
      "$1,500.00"
    );
    await expect(page.locator("#estimate-customer-notes")).toContainText("Painting excluded");
    await page.goto(`/estimates/${id}/preview`);
    await expect(page.getByText("PW Concrete Slab").first()).toBeVisible();
    await expect(page.getByText("Painting excluded").first()).toBeVisible();
    const pdf = await page.request.get(`/api/estimates/${id}/pdf`);
    expect(pdf.ok()).toBe(true);
    expect(pdf.headers()["content-type"]).toContain("application/pdf");
    expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  } finally {
    if (id) await deleteLocalEstimateFixtureGraphs([id]);
  }
});
