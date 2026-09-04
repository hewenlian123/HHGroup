import { randomUUID } from "node:crypto";
import { expect, test, type Locator } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { loginAsE2EOwner, reloadWithE2EAuth } from "./e2e-auth-owner";
import { isLocalE2eTarget } from "./e2e-env-helpers";

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  const host = new URL(url).hostname;
  if (host !== "localhost" && host !== "127.0.0.1") return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function saveSection(section: Locator) {
  const responsePromise = section
    .page()
    .waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes("/api/projects/") &&
        response.url().includes("/closeout/")
    );
  await section.getByRole("button", { name: "Save", exact: true }).click();
  const response = await responsePromise;
  expect(response.status(), await response.text()).toBe(200);
  await expect(section.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
}

test.describe("Project Closeout canonical persistence", () => {
  test.describe.configure({ timeout: 180_000 });

  test("Open -> Edit/Save -> reload persists the canonical closeout model", async ({ page }) => {
    test.skip(!isLocalE2eTarget(), "Closeout persistence is local-fixture only.");
    const admin = adminClient();
    test.skip(!admin, "Local Supabase service role is required.");

    const projectId = randomUUID();
    const marker = `E2E-CLOSEOUT-${Date.now().toString(36).toUpperCase()}`;
    const projectInsert = await admin!.from("projects").insert({
      id: projectId,
      name: `[E2E] ${marker}`,
      status: "active",
      budget: 9000,
      contract_amount: 9000,
    });
    expect(projectInsert.error, projectInsert.error?.message).toBeNull();

    try {
      await loginAsE2EOwner(page, `/projects/${projectId}?tab=closeout`);
      await expect(page.getByText("Final Punch List", { exact: true })).toBeVisible({
        timeout: 60_000,
      });

      const punch = page.locator(".final-punch-print");
      await punch.locator('input[type="date"]').fill("2026-09-03");
      await punch.getByPlaceholder("Inspector name").fill(`${marker} Inspector`);
      await punch.getByPlaceholder("Notes").fill(`${marker} Punch Notes`);
      await punch.getByRole("button", { name: "+ Add item", exact: true }).click();
      await punch.locator("tbody input").last().fill(`${marker} Item`);
      await punch.locator("tbody select").last().selectOption("done");
      await saveSection(punch);

      const warranty = page
        .getByText("Warranty Information", { exact: true })
        .locator("xpath=ancestor::div[contains(@class,'rounded-hh-task')][1]");
      await warranty.locator('input[type="date"]').fill("2026-09-04");
      await warranty.locator('input[type="number"]').fill("18");
      await warranty.getByPlaceholder("Notes").fill(`${marker} Warranty Notes`);
      await saveSection(warranty);

      const completion = page
        .getByText("Completion Certificate", { exact: true })
        .locator("xpath=ancestor::div[contains(@class,'rounded-hh-task')][1]");
      await completion.locator('input[type="date"]').fill("2026-09-05");
      await completion.getByPlaceholder("Contractor").fill(`${marker} Contractor`);
      await completion.getByPlaceholder("Client").fill(`${marker} Client`);
      await completion.getByPlaceholder("Signature").nth(0).fill(`${marker} Contractor Sign`);
      await completion.getByPlaceholder("Signature").nth(1).fill(`${marker} Client Sign`);
      await saveSection(completion);

      await reloadWithE2EAuth(page);
      await expect(page.getByText("Final Punch List", { exact: true })).toBeVisible({
        timeout: 60_000,
      });
      await expect(punch.getByPlaceholder("Inspector name")).toHaveValue(`${marker} Inspector`);
      await expect(punch.locator("tbody input").last()).toHaveValue(`${marker} Item`);
      await expect(warranty.locator('input[type="number"]')).toHaveValue("18");
      await expect(completion.getByPlaceholder("Contractor")).toHaveValue(`${marker} Contractor`);

      const [punchRow, warrantyRow, completionRow] = await Promise.all([
        admin!
          .from("final_punch_lists")
          .select("id,project_id,inspection_date,inspector,notes")
          .eq("project_id", projectId)
          .single(),
        admin!
          .from("warranties")
          .select("project_id,start_date,period_months,notes")
          .eq("project_id", projectId)
          .single(),
        admin!
          .from("completion_certificates")
          .select("project_id,completion_date,contractor_name,client_name")
          .eq("project_id", projectId)
          .single(),
      ]);
      expect(punchRow.error, punchRow.error?.message).toBeNull();
      expect(warrantyRow.error, warrantyRow.error?.message).toBeNull();
      expect(completionRow.error, completionRow.error?.message).toBeNull();
      expect(punchRow.data).toMatchObject({
        project_id: projectId,
        inspection_date: "2026-09-03",
        inspector: `${marker} Inspector`,
        notes: `${marker} Punch Notes`,
      });
      expect(warrantyRow.data).toMatchObject({
        project_id: projectId,
        start_date: "2026-09-04",
        period_months: 18,
        notes: `${marker} Warranty Notes`,
      });
      expect(completionRow.data).toMatchObject({
        project_id: projectId,
        completion_date: "2026-09-05",
        contractor_name: `${marker} Contractor`,
        client_name: `${marker} Client`,
      });

      const items = await admin!
        .from("final_punch_list_items")
        .select("item,status")
        .eq("punch_list_id", String(punchRow.data!.id));
      expect(items.error, items.error?.message).toBeNull();
      expect(items.data).toEqual([{ item: `${marker} Item`, status: "done" }]);
    } finally {
      const punchRows = await admin!
        .from("final_punch_lists")
        .select("id")
        .eq("project_id", projectId);
      const punchIds = (punchRows.data ?? []).map((row) => String(row.id));
      if (punchIds.length > 0) {
        await admin!.from("final_punch_list_items").delete().in("punch_list_id", punchIds);
      }
      await Promise.all([
        admin!.from("final_punch_lists").delete().eq("project_id", projectId),
        admin!.from("warranties").delete().eq("project_id", projectId),
        admin!.from("completion_certificates").delete().eq("project_id", projectId),
      ]);
      await admin!.from("projects").delete().eq("id", projectId);
    }
  });
});
