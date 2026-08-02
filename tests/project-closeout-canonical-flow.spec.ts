import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { deleteE2EAuthUsers, loginAsE2EOwner } from "./e2e-auth-owner";

const PROJECT_ID = "a1111111-1111-4111-8111-111111111111";
const PROJECT_NAME = "[E2E] Canonical Closeout Flow";

function localAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secret =
    process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !secret) throw new Error("Local Closeout E2E requires Supabase service credentials.");
  const parsed = new URL(url);
  if (!new Set(["localhost", "127.0.0.1"]).has(parsed.hostname)) {
    throw new Error("Canonical Closeout browser flow is local-Docker only.");
  }
  return createClient(url, secret, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

async function cleanupFixture(admin: SupabaseClient) {
  const { error } = await admin.from("projects").delete().eq("id", PROJECT_ID);
  if (error) throw new Error("Unable to clean the canonical Closeout browser fixture.");
}

test.describe("canonical Project Closeout owner flow", () => {
  test.beforeEach(async () => {
    const admin = localAdmin();
    await cleanupFixture(admin);
    const { error } = await admin.from("projects").insert({ id: PROJECT_ID, name: PROJECT_NAME });
    if (error) throw new Error("Unable to create the canonical Closeout browser fixture.");
  });

  test.afterEach(async () => {
    const admin = localAdmin();
    await cleanupFixture(admin);
    const [punch, warranty, completion] = await Promise.all([
      admin
        .from("final_punch_lists")
        .select("id", { count: "exact", head: true })
        .eq("project_id", PROJECT_ID),
      admin
        .from("warranties")
        .select("id", { count: "exact", head: true })
        .eq("project_id", PROJECT_ID),
      admin
        .from("completion_certificates")
        .select("id", { count: "exact", head: true })
        .eq("project_id", PROJECT_ID),
    ]);
    expect(punch.count).toBe(0);
    expect(warranty.count).toBe(0);
    expect(completion.count).toBe(0);
    await deleteE2EAuthUsers();
  });

  test("saves and reloads ordered punch, warranty, and completion data on desktop and mobile", async ({
    page,
  }) => {
    await loginAsE2EOwner(page, `/projects/${PROJECT_ID}`);
    await page.goto(`/projects/${PROJECT_ID}?tab=closeout`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Final Punch List", { exact: true })).toBeVisible();

    const punch = page.locator(".final-punch-print");
    await punch.getByRole("button", { name: "+ Add item" }).click();
    await punch.getByRole("button", { name: "+ Add item" }).click();
    const rows = punch.locator("tbody tr");
    await rows.nth(0).locator("input").fill("First ordered item");
    await rows.nth(0).locator("select").selectOption("pending");
    await rows.nth(1).locator("input").fill("Second ordered item");
    await rows.nth(1).locator("select").selectOption("done");
    const punchSave = page.waitForResponse(
      (response) => response.url().endsWith(`/closeout/punch`) && response.status() === 200
    );
    await punch.getByRole("button", { name: "Save", exact: true }).click();
    await punchSave;

    const warranty = page
      .getByText("Warranty Information", { exact: true })
      .locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
    await warranty.locator('input[type="date"]').fill("2026-08-02");
    await warranty.locator('input[type="number"]').fill("24");
    const warrantySave = page.waitForResponse(
      (response) => response.url().endsWith(`/closeout/warranty`) && response.status() === 200
    );
    await warranty.getByRole("button", { name: "Save", exact: true }).click();
    await warrantySave;

    const completion = page
      .getByText("Completion Certificate", { exact: true })
      .locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]");
    await completion.locator('input[type="date"]').fill("2026-08-02");
    await completion.getByPlaceholder("Contractor").fill("HH Group");
    await completion.getByPlaceholder("Client").fill("E2E Client");
    const completionSave = page.waitForResponse(
      (response) => response.url().endsWith(`/closeout/completion`) && response.status() === 200
    );
    await completion.getByRole("button", { name: "Save", exact: true }).click();
    await completionSave;

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator(".final-punch-print tbody tr").nth(0).locator("input")).toHaveValue(
      "First ordered item"
    );
    await expect(page.locator(".final-punch-print tbody tr").nth(1).locator("input")).toHaveValue(
      "Second ordered item"
    );
    await expect(page.getByPlaceholder("Contractor")).toHaveValue("HH Group");

    let pdfRequests = 0;
    await page.route(`**/api/projects/${PROJECT_ID}/closeout/punch`, (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, message: "Save rejected" }),
      })
    );
    await page.route(`**/api/projects/${PROJECT_ID}/closeout/generate-punch-pdf`, (route) => {
      pdfRequests += 1;
      return route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
    });
    await page.locator(".final-punch-print").getByRole("button", { name: "Generate PDF" }).click();
    await expect(page.getByText("Save rejected", { exact: true })).toBeVisible();
    expect(pdfRequests).toBe(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByText("Final Punch List", { exact: true })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
