import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { loadE2EProcessEnv } from "./e2e-load-env";
import { assertEstimateCertificationLocalOnly } from "./e2e-supabase-url-guard";
import { E2E_PRESERVED_PROJECT_ID as projectId } from "./e2e-cleanup-db";

const marker = `PW Workflow Acceptance ${randomUUID()}`;
const fileName = `${marker.replaceAll(" ", "-")}.pdf`;
const folder = `documents/${projectId}`;
let db: SupabaseClient;
const owned = [
  ["project_tasks", "title", marker],
  ["project_material_selections", "item", marker],
  ["documents", "file_name", fileName],
] as const;

test.beforeAll(async ({ baseURL, storageState }) => {
  loadE2EProcessEnv();
  const target = assertEstimateCertificationLocalOnly({
    baseURL,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
  expect(storageState, "An existing authenticated storageState is required").toBeTruthy();
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  expect(key, "Local credential required for exact cleanup").toBeTruthy();
  db = createClient(target.supabaseOrigin, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  for (const [table, column] of owned) {
    const schema = await db.from(table).select(`id,project_id,${column}`).limit(0);
    expect(schema.error).toBeNull();
  }
});

test.afterAll(async () => {
  if (!db) return;
  // Each query is scoped to this run's exact UUID marker and the preserved project.
  const results = await Promise.allSettled([
    ...owned.map(async ([table, column, value]) => {
      const deleted = await db.from(table).delete().eq("project_id", projectId).eq(column, value);
      expect(deleted.error, `Cleanup ${table}`).toBeNull();
      const remaining = await db
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId)
        .eq(column, value);
      expect(remaining.error).toBeNull();
      expect(remaining.count, `${table} residual rows`).toBe(0);
    }),
    (async () => {
      // This exact unique filename also finds an uploaded object with no metadata row.
      const bucket = db.storage.from("attachments");
      const listed = await bucket.list(folder, { search: fileName, limit: 100 });
      expect(listed.error).toBeNull();
      expect(Array.isArray(listed.data)).toBe(true);
      const files = listed.data!.filter((file) => file.name.endsWith(`-${fileName}`));
      if (files.length) {
        const removed = await bucket.remove(files.map((file) => `${folder}/${file.name}`));
        expect(removed.error).toBeNull();
      }
      const residual = await bucket.list(folder, { search: fileName, limit: 100 });
      expect(residual.error).toBeNull();
      expect(residual.data).toEqual([]);
    })(),
  ]);
  const failures = results.filter((result) => result.status === "rejected");
  expect(
    failures.map((result) => String(result.reason)),
    "Exact cleanup failures"
  ).toEqual([]);
});

test("project task creation persists under the existing session", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(`/projects/${projectId}?tab=tasks`);
  await page.getByRole("button", { name: "+ New Task", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title", { exact: true }).fill(marker);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const row = page.getByRole("row").filter({ hasText: marker });
  await expect(row).toBeVisible();
  await expect
    .poll(async () => {
      const task = await db
        .from("project_tasks")
        .select("project_id,status")
        .eq("project_id", projectId)
        .eq("title", marker)
        .single();
      expect(task.error).toBeNull();
      return task.data;
    })
    .toEqual({ project_id: projectId, status: "todo" });
  expect(errors).toEqual([]);
});

test("project materials creation persists under the existing session", async ({ page }) => {
  const response = await page.request.post(`/api/projects/${projectId}/materials`, {
    data: { item: marker, category: "Test", material_name: marker },
  });
  expect(response.ok(), await response.text()).toBe(true);
  const material = await db
    .from("project_material_selections")
    .select("project_id,item")
    .eq("project_id", projectId)
    .eq("item", marker)
    .single();
  expect(material.error).toBeNull();
  expect(material.data).toEqual({ project_id: projectId, item: marker });
});

test("project document upload and download persist under the existing session", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(`/projects/${projectId}?tab=documents`);
  const pdf = Buffer.from(
    "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"
  );
  const form = page.locator("form").filter({ has: page.locator('input[name="file"]') });
  await form
    .locator('input[name="file"]')
    .setInputFiles({ name: fileName, mimeType: "application/pdf", buffer: pdf });
  await form.getByRole("button", { name: "Upload", exact: true }).click();
  const documentRow = page.getByRole("row").filter({ hasText: fileName });
  await expect(documentRow).toBeVisible({ timeout: 30_000 });
  const document = await db
    .from("documents")
    .select("project_id,file_name,file_path,mime_type")
    .eq("project_id", projectId)
    .eq("file_name", fileName)
    .single();
  expect(document.error).toBeNull();
  expect(document.data).toMatchObject({
    project_id: projectId,
    file_name: fileName,
    mime_type: "application/pdf",
  });
  const popupPromise = page.waitForEvent("popup");
  await documentRow.getByRole("button", { name: "Download", exact: true }).click();
  const popup = await popupPromise;
  await expect.poll(() => popup.url()).toContain("/storage/v1/object/sign/attachments/");
  const downloaded = await page.request.get(popup.url());
  expect(downloaded.ok()).toBe(true);
  expect(await downloaded.body()).toEqual(pdf);
  await popup.close();
  expect(errors).toEqual([]);
});
