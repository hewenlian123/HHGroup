import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { addE2EOwnerSession, deleteE2EOwner } from "./e2e-auth-owner";

test.describe("New invoice authenticated production rendering", () => {
  const customerId = randomUUID();
  const projectId = randomUUID();
  const invoiceId = randomUUID();
  const marker = `[E2E] invoice-runtime-${invoiceId}`;
  function localDb() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname)) {
      throw new Error("Invoice runtime fixtures are local-Docker only.");
    }
    const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) throw new Error("Local test credential required.");
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  test.beforeAll(async () => {
    const db = localDb();
    expect((await db.from("customers").insert({ id: customerId, name: marker })).error).toBeNull();
    expect(
      (
        await db
          .from("projects")
          .insert({ id: projectId, name: marker, customer_id: customerId, status: "active" })
      ).error
    ).toBeNull();
    expect(
      (
        await db.from("invoices").insert({
          id: invoiceId,
          invoice_no: marker,
          project_id: projectId,
          customer_id: customerId,
          client_name: marker,
          issue_date: "2026-09-03",
          due_date: "2026-09-30",
          status: "Draft",
          subtotal: 250,
          tax_amount: 0,
          total: 250,
          paid_total: 0,
          balance_due: 250,
        })
      ).error
    ).toBeNull();
    expect(
      (
        await db.from("invoice_items").insert({
          invoice_id: invoiceId,
          description: marker,
          qty: 2,
          unit_price: 125,
          amount: 250,
        })
      ).error
    ).toBeNull();
  });
  test.afterAll(async () => {
    const db = localDb();
    for (const [table, column, id] of [
      ["invoice_items", "invoice_id", invoiceId],
      ["invoices", "id", invoiceId],
      ["projects", "id", projectId],
      ["customers", "id", customerId],
    ]) {
      expect((await db.from(table).delete().eq(column, id)).error).toBeNull();
      const residual = await db
        .from(table)
        .select(column, { count: "exact", head: true })
        .eq(column, id);
      expect(residual.error).toBeNull();
      expect(residual.count).toBe(0);
    }
    await deleteE2EOwner();
  });

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 820, height: 1180 },
    { width: 390, height: 844 },
  ]) {
    test(`renders the invoice form without an invalid React element at ${viewport.width}px`, async ({
      page,
      baseURL,
    }) => {
      test.setTimeout(60_000);
      expect(process.env.E2E_SERVER_RUNTIME).toBe("production");
      const errors: string[] = [];
      const failedResponses: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      page.on("response", (response) => {
        if (response.status() >= 400)
          failedResponses.push(`${response.status()} ${new URL(response.url()).pathname}`);
      });
      await page.setViewportSize(viewport);
      await addE2EOwnerSession(page.context(), baseURL!);
      const response = await page.goto("/financial/invoices/new");
      expect(response?.status()).toBe(200);
      expect(await response!.text()).toContain('data-testid="invoice-new-line-1-item-input"');
      await expect(page.getByRole("heading", { name: "New Invoice", exact: true })).toBeVisible();
      await expect(page.getByTestId("invoice-new-project-select")).toBeVisible();
      await expect(page.getByTestId("invoice-new-client-input")).toBeVisible();
      await expect(page.getByRole("button", { name: "Save draft", exact: true })).toBeVisible();
      await page.getByTestId("invoice-new-project-select").selectOption(projectId);
      await page
        .getByRole("combobox")
        .filter({ has: page.locator('option[value="' + customerId + '"]') })
        .selectOption(customerId);
      await expect(page.getByTestId("invoice-new-client-input")).toHaveValue(marker);
      await page.getByTestId("invoice-new-line-1-item-input").fill("Read-only draft form check");
      await page.getByTestId("invoice-new-line-1-qty-input").fill("2");
      await page.getByTestId("invoice-new-line-1-rate-input").fill("125");
      await expect(page.getByText("$250.00", { exact: true }).first()).toBeVisible();
      await page.getByRole("button", { name: "Add another item", exact: true }).click();
      await expect(page.getByTestId("invoice-new-line-2-item-input")).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Create draft invoice", exact: true })
      ).toBeEnabled();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
      ).toBe(true);
      expect(failedResponses).toEqual([]);
      expect(errors).toEqual([]);
    });
  }

  test("adjacent invoice list, detail, preview and AR retain financial rendering", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 400)
        errors.push(`${response.status()} ${new URL(response.url()).pathname}`);
    });
    await addE2EOwnerSession(page.context(), baseURL!);
    for (const route of [
      "/financial/invoices",
      `/financial/invoices/${invoiceId}`,
      `/financial/invoices/${invoiceId}/preview`,
      "/financial/ar",
    ]) {
      expect((await page.goto(route))?.status(), route).toBe(200);
      if (route.includes(invoiceId)) {
        await expect(page.getByText(marker, { exact: true }).first()).toBeVisible();
        await expect(page.getByText("$250.00", { exact: true }).first()).toBeVisible();
      } else {
        await expect(page.getByRole("heading").first()).toBeVisible();
        if (route === "/financial/invoices") {
          await expect(page.getByText(marker, { exact: true }).first()).toBeVisible();
        }
      }
      expect(errors, route).toEqual([]);
    }
    const persisted = await localDb()
      .from("invoices")
      .select("total,paid_total,balance_due,status")
      .eq("id", invoiceId)
      .single();
    expect(persisted.error).toBeNull();
    expect(persisted.data).toEqual({
      total: 250,
      paid_total: 0,
      balance_due: 250,
      status: "Draft",
    });
  });
});
