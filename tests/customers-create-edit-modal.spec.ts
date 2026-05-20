import { expect, test, type Locator, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { assertE2ESupabaseUrlSafeForMutations } from "./e2e-supabase-url-guard";

const customerNames = new Set<string>();

async function cleanupCustomersModalData(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return;

  assertE2ESupabaseUrlSafeForMutations(url);
  const supabase = createClient(url, key);
  const customers = Array.from(customerNames);
  if (customers.length > 0) {
    await supabase.from("customers").delete().in("name", customers);
  }
}

async function fillCustomerModal(
  dialog: Locator,
  params: {
    name: string;
    phone: string;
    email: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    contactPerson: string;
    companyName: string;
    notes: string;
  }
): Promise<void> {
  await dialog.getByTestId("customers-modal-name").fill(params.name);
  await dialog.getByTestId("customers-modal-phone").fill(params.phone);
  await dialog.getByTestId("customers-modal-email").fill(params.email);
  await dialog.getByTestId("customers-modal-address").fill(params.address);
  await dialog.getByTestId("customers-modal-city").fill(params.city);
  await dialog.getByTestId("customers-modal-state").fill(params.state);
  await dialog.getByTestId("customers-modal-zip").fill(params.zip);
  await dialog.getByTestId("customers-modal-contact-person").fill(params.contactPerson);
  await dialog.getByTestId("customers-modal-company-name").fill(params.companyName);
  await dialog.getByTestId("customers-modal-notes").fill(params.notes);
}

test.describe("Customers create/edit modal", () => {
  test.afterAll(async () => {
    await cleanupCustomersModalData();
  });

  test("creates and edits customer with formatted phone", async ({ page }) => {
    test.setTimeout(120_000);
    const stamp = Date.now();
    const customerName = `PW Debbie Bergase ${stamp}`;
    customerNames.add(customerName);

    await page.goto("/customers");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Customers" })).toBeVisible({
      timeout: 60_000,
    });

    await page
      .getByRole("button", { name: /\+ New Customer|New customer/i })
      .first()
      .click();
    const dialog = page.getByRole("dialog", { name: "New customer" });
    await expect(dialog).toBeVisible({ timeout: 60_000 });

    await fillCustomerModal(dialog, {
      name: customerName,
      phone: "8083323232",
      email: "debbie@example.com",
      address: "123 Test St",
      city: "Honolulu",
      state: "HI",
      zip: "96813",
      contactPerson: "Debbie",
      companyName: "Debbie Bergase LLC",
      notes: "Gate code and preferred contact time",
    });
    await expect(dialog.getByTestId("customers-modal-phone")).toHaveValue("(808) 332-3232");

    const createResponse = page.waitForResponse(
      (res) => res.request().method() === "POST" && res.url().endsWith("/api/customers") && res.ok()
    );
    await dialog.getByTestId("customers-modal-save").click();
    await createResponse;
    await expect(dialog).toBeHidden({ timeout: 60_000 });

    await expect
      .poll(async () => {
        const res = await page.request.get("/api/customers");
        const json = (await res.json()) as { customers?: { name: string }[] };
        return json.customers?.some((c) => c.name === customerName) ?? false;
      })
      .toBe(true);

    const search = page.locator('input[placeholder="Search customers…"]:visible').first();
    await search.fill(customerName);
    await expect(page.getByRole("link", { name: customerName })).toBeVisible({ timeout: 60_000 });
    const tableRow = page.locator("tbody tr").filter({ hasText: customerName });
    await expect(tableRow.getByText("Debbie Bergase LLC")).toBeVisible({ timeout: 60_000 });
    await expect(tableRow.getByText("(808) 332-3232")).toBeVisible({ timeout: 60_000 });

    const mobileActions = page.getByRole("button", {
      name: new RegExp(`Actions for ${customerName}`),
    });
    if ((await mobileActions.count()) > 0) {
      await mobileActions.first().click();
    } else {
      await page.locator("tbody tr").filter({ hasText: customerName }).getByRole("button").click();
    }
    await page.getByRole("menuitem", { name: "Edit" }).click();
    const editDialog = page.getByRole("dialog", { name: "Edit customer" });
    await expect(editDialog).toBeVisible({ timeout: 60_000 });
    await expect(editDialog.getByTestId("customers-modal-phone")).toHaveValue("(808) 332-3232");

    await editDialog.getByTestId("customers-modal-phone").fill("8085551212");
    await editDialog.getByTestId("customers-modal-phone").blur();
    await expect(editDialog.getByTestId("customers-modal-phone")).toHaveValue("(808) 555-1212");

    const patchResponse = page.waitForResponse(
      (res) =>
        res.request().method() === "PATCH" &&
        /\/api\/customers\/[0-9a-f-]+$/i.test(new URL(res.url()).pathname) &&
        res.ok()
    );
    await editDialog.getByTestId("customers-modal-save").click();
    const saved = await patchResponse;
    const savedBody = (await saved.json()) as { phone?: string | null };
    expect(savedBody.phone).toBe("(808) 555-1212");
    await expect(editDialog).toBeHidden({ timeout: 60_000 });

    const updatedRow = page.locator("tbody tr").filter({ hasText: customerName });
    await expect(updatedRow.getByText("(808) 555-1212")).toBeVisible({ timeout: 60_000 });

    await page.reload({ waitUntil: "networkidle" });
    await expect
      .poll(async () => {
        const res = await page.request.get("/api/customers");
        const json = (await res.json()) as {
          customers?: { name: string; phone?: string | null; company_name?: string | null }[];
        };
        const row = json.customers?.find((c) => c.name === customerName);
        return row?.phone === "(808) 555-1212" && row?.company_name === "Debbie Bergase LLC";
      })
      .toBe(true);
  });
});
