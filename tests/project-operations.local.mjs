import assert from "node:assert/strict";
import { expect } from "@playwright/test";

// Invoked only inside the localhost organization fixture. Every created row belongs to its exact projects.
export async function verifyProjectOperations({
  page,
  context,
  sql,
  projectA,
  projectCompany,
  remember,
  storagePaths,
  marker,
  viewport,
}) {
  const title = `${marker} persisted`;
  const capture = async (tab, text) => {
    await page.waitForLoadState("networkidle");
    await page.reload();
    await page.waitForLoadState("networkidle");
    if (await page.getByTestId("project-header-profit").count())
      await expect(page.getByTestId("project-header-profit")).not.toHaveText(/Loading/);
    await expect(
      page.getByText(text, { exact: true }).filter({ visible: true }).first()
    ).toBeVisible();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
      `${tab} overflow`
    );
    await page.screenshot({
      path: `/tmp/hh-project-${tab}-${viewport.width}-saved.png`,
      fullPage: true,
    });
  };
  for (const [tab, button, input, save, table, column] of [
    ["tasks", "+ New Task", "Title", "Save", "project_tasks", "title"],
    ["schedule", "New schedule item", "Task name", "Add", "project_schedule", "title"],
    ["punch-list", "Add issue", "Short title", "Save", "punch_list", "issue"],
    [
      "inspections",
      "New inspection",
      "e.g. Foundation, Framing",
      "Add",
      "inspection_log",
      "inspection_type",
    ],
  ]) {
    await page.goto(`/projects/${projectA}?tab=${tab}`);
    const buttonMatcher = tab === "tasks" ? button : new RegExp(button, "i");
    await page
      .getByRole("button", { name: buttonMatcher, exact: tab === "tasks" })
      .filter({ visible: true })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    if (tab === "tasks") await dialog.getByLabel(input, { exact: true }).fill(title);
    else await dialog.getByPlaceholder(input, { exact: true }).fill(title);
    await dialog.getByRole("button", { name: save, exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await capture(tab, title);
    const rows =
      await sql`select id from ${sql(table)} where project_id=${projectA} and ${sql(column)}=${title}`;
    assert.equal(rows.length, 1, `${tab} persisted under exact project`);
  }
  const photo = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    "base64"
  );
  const uploaded = await context.request.post("/api/operations/site-photos/upload", {
    multipart: {
      project_id: projectA,
      file: { name: `${marker}.png`, mimeType: "image/png", buffer: photo },
    },
  });
  const upload = await uploaded.json();
  assert.equal(uploaded.status(), 200, JSON.stringify(upload));
  storagePaths.add(upload.path);
  const [{ id: photoDocumentId }] =
    await sql`select id from public.documents where project_id=${projectA} and file_path=${upload.path}`;
  remember("documents", photoDocumentId);
  const created = await context.request.post("/api/operations/site-photos", {
    data: { project_id: projectA, photo_url: upload.path, description: title },
  });
  assert.equal(created.status(), 200, await created.text());
  await page.goto(`/projects/${projectA}?tab=photos`);
  await capture("photos", title);
  const [savedPhoto] =
    await sql`select id,photo_url from public.site_photos where project_id=${projectA} and description=${title}`;
  remember("site_photos", savedPhoto.id);
  assert.equal(savedPhoto.photo_url, upload.path);
  const response = await context.request.get(
    `/api/operations/site-photos/photo?path=${encodeURIComponent(upload.path)}`
  );
  assert.equal(response.status(), 200, "Persisted photo is readable through scoped route");
  assert.deepEqual(
    await response.body(),
    photo,
    "Photo bytes survive persistence and scoped download"
  );
  const deleted = await context.request.delete(`/api/operations/site-photos/${savedPhoto.id}`);
  assert.equal(deleted.status(), 200, await deleted.text());
  const [{ photoRows, documentRows, objectRows }] =
    await sql`select (select count(*)::int from public.site_photos where id=${savedPhoto.id}) "photoRows",(select count(*)::int from public.documents where file_path=${upload.path}) "documentRows",(select count(*)::int from storage.objects where bucket_id='attachments' and name=${upload.path}) "objectRows"`;
  assert.deepEqual(
    { photoRows, documentRows, objectRows },
    { photoRows: 0, documentRows: 0, objectRows: 0 },
    "Photo deletion clears its exact metadata and object"
  );

  await page.goto(`/projects/${projectCompany}/change-orders/new`);
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Amount (revenue impact)").fill("125.25");
  await page.getByRole("button", { name: "Create change order", exact: true }).click();
  await page.waitForURL(new RegExp(`/projects/${projectCompany}/change-orders/[0-9a-f-]+$`));
  await capture("change-order", title);
  const [co] =
    await sql`select title,total,total_amount,status from public.project_change_orders where project_id=${projectCompany} and title=${title}`;
  assert.equal(Number(co.total), 125.25);
  assert.equal(Number(co.total_amount), 125.25);
  assert.equal(co.status, "Draft");
}
