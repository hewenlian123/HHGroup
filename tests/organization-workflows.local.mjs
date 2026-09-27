import { verifyProjectOperations } from "./project-operations.local.mjs";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { chromium, expect } from "@playwright/test";

// Called only by the explicit local authorization fixture; never creates production identities.
export async function verifyOrganizationWorkflows({
  actors,
  projectA,
  projectCompany,
  remember,
  storagePaths,
  marker,
  sql,
  t,
}) {
  const baseURL = process.env.E2E_BASE_URL || "http://localhost:3000";
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname));
  const browser = await chromium.launch({ headless: true });
  const results = [];
  const viewports = [
    { width: 1440, height: 900 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ];
  let uploadRequest;
  const pdf = Buffer.from(
    "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"
  );
  try {
    for (const viewport of viewports) {
      const workflowMarker = `${marker} ${viewport.width}`;
      for (const actor of [...actors.slice(0, 4), actors.at(-1)].filter(
        (actor) =>
          !process.env.HH_ORG_AUTH_BROWSER_ACTOR ||
          actor.name === process.env.HH_ORG_AUTH_BROWSER_ACTOR
      )) {
        await t.test(
          `${actor.name} ${viewport.width}: real local Materials/Attachments session`,
          async () => {
            const context = await browser.newContext({
              baseURL,
              viewport,
            });
            try {
              if (actor.email) {
                const login = await context.request.post("/api/auth/login", {
                  headers: { Origin: baseURL },
                  data: { email: actor.email, password: actor.password, redirect: "/projects" },
                });
                assert.equal(login.status(), 200, `${actor.name} app session sign-in`);
              }
              const page = await context.newPage();
              const pageErrors = [];
              const consoleErrors = [];
              page.on("console", (message) => {
                if (message.type() === "error")
                  consoleErrors.push(`${message.text()} ${message.location().url}`);
              });
              page.on("pageerror", (error) => pageErrors.push(error.message));
              const api = `/api/projects/${projectA}/materials`;
              const read = await context.request.get(api, { maxRedirects: 0 });
              assert.equal(read.ok(), actor.read, `${actor.name} HTTP materials read`);
              if (actor.write) {
                const item = `${workflowMarker} ${actor.name} material`;
                await page.goto(`/projects/${projectA}?tab=materials`);
                await expect(page.locator(`[data-project-context="${projectA}"]`)).toBeVisible();
                await page.getByRole("button", { name: "+ Add Selection", exact: true }).click();
                const dialog = page.getByRole("dialog");
                await dialog.getByLabel("Item", { exact: true }).fill(item);
                await dialog
                  .getByLabel("Material name", { exact: true })
                  .fill("Local authorization fixture");
                await dialog.getByRole("button", { name: "Add", exact: true }).click();
                await expect(dialog).not.toBeVisible();
                await page.waitForLoadState("networkidle");
                await page.reload();
                await page.getByRole("button", { name: `Edit ${item}`, exact: true }).click();
                await dialog.getByLabel("Item", { exact: true }).fill(item + " edited");
                await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
                await expect(dialog).not.toBeVisible();
                await page.waitForLoadState("networkidle");
                await page.reload();
                await expect(
                  page.getByRole("button", { name: `Edit ${item} edited`, exact: true })
                ).toBeVisible();
                await page.waitForLoadState("networkidle");
                await expect(page.getByTestId("project-header-profit")).not.toHaveText(/Loading/);
                const saved =
                  await sql`select item from public.project_material_selections where project_id=${projectA} and item=${item + " edited"}`;
                assert.equal(saved.length, 1, "Create/save/refresh/edit/refresh persisted to DB");
                await page.screenshot({
                  path: `/tmp/hh-authz-${actor.name}-${viewport.width}-materials.png`,
                  fullPage: true,
                });
                const fileName = `${workflowMarker}-${actor.name}.pdf`;
                await page.goto(`/projects/${projectA}?tab=documents`);
                page.on("request", (request) => {
                  if (
                    request.method() === "POST" &&
                    request.headers()["next-action"] &&
                    request.headers()["content-type"]?.includes("multipart/form-data")
                  ) {
                    uploadRequest = {
                      body: request.postDataBuffer(),
                      headers: {
                        "next-action": request.headers()["next-action"],
                        "content-type": request.headers()["content-type"],
                        Origin: baseURL,
                      },
                      url: request.url(),
                    };
                  }
                });
                const form = page
                  .locator("form")
                  .filter({ has: page.locator('input[name="file"]') });
                await form
                  .locator('input[name="file"]')
                  .setInputFiles({ name: fileName, mimeType: "application/pdf", buffer: pdf });
                await form.getByRole("button", { name: "Upload", exact: true }).click();
                let row = page.getByRole("row").filter({ hasText: fileName });
                try {
                  await expect(row).toBeVisible({ timeout: 15000 });
                } catch (error) {
                  await page.screenshot({
                    path: `/tmp/hh-authz-${actor.name}-${viewport.width}-upload-failed.png`,
                    fullPage: true,
                  });
                  writeFileSync(
                    `/tmp/hh-authz-${actor.name}-${viewport.width}-upload-failed.json`,
                    JSON.stringify(
                      { pageErrors, consoleErrors, form: await form.innerText() },
                      null,
                      2
                    )
                  );
                  throw error;
                }
                const [document] =
                  await sql`select id,organization_id,file_path from public.documents where project_id=${projectA} and file_name=${fileName}`;
                assert.ok(document);
                assert.equal(document.file_path.split("/")[5], document.id);
                await page.waitForLoadState("networkidle");
                await page.reload();
                row = page.getByRole("row").filter({ hasText: fileName });
                await expect(row).toBeVisible();
                const signedRequest = context.waitForEvent("request", {
                  predicate: (request) =>
                    request.url().includes("/storage/v1/object/sign/attachments/"),
                });
                await row.getByRole("button", { name: "Download", exact: true }).click();
                const signed = await signedRequest;
                const downloaded = await context.request.get(signed.url());
                assert.equal(downloaded.status(), 200);
                assert.deepEqual(await downloaded.body(), pdf);
                for (const other of context.pages()) if (other !== page) await other.close();
                await page.screenshot({
                  path: `/tmp/hh-authz-${actor.name}-${viewport.width}-documents.png`,
                  fullPage: true,
                });
              } else {
                const deniedWrite = await context.request.post(api, {
                  headers: { Origin: baseURL },
                  data: { item: workflowMarker + " forbidden" },
                  maxRedirects: 0,
                });
                assert.ok(!deniedWrite.ok(), "Unauthorized HTTP material save explicitly denied");
                const deniedEdit = await context.request.patch(api, {
                  headers: { Origin: baseURL },
                  data: { id: projectA, item: workflowMarker + " forbidden" },
                  maxRedirects: 0,
                });
                assert.ok(!deniedEdit.ok(), "Unauthorized HTTP material edit explicitly denied");
                await page.goto(`/projects/${projectA}?tab=materials`);
                if (actor.read) {
                  await expect(
                    page.getByRole("button", {
                      name: `Edit ${workflowMarker} owner material edited`,
                      exact: true,
                    })
                  ).toBeVisible();
                  await page.goto(`/projects/${projectA}?tab=documents`);
                  const row = page
                    .getByRole("row")
                    .filter({ hasText: `${workflowMarker}-owner.pdf` });
                  await expect(row).toBeVisible();
                  const signedRequest = context.waitForEvent("request", {
                    predicate: (request) =>
                      request.url().includes("/storage/v1/object/sign/attachments/"),
                  });
                  await row.getByRole("button", { name: "Download", exact: true }).click();
                  const signed = await signedRequest;
                  assert.equal((await context.request.get(signed.url())).status(), 200);
                  for (const other of context.pages()) if (other !== page) await other.close();
                  await page.waitForLoadState("networkidle");
                  await page.reload();
                  await expect(row).toBeVisible();
                } else {
                  await expect(
                    page.locator(`[data-project-context="${projectA}"]`)
                  ).not.toBeVisible();
                }
                assert.ok(
                  uploadRequest,
                  "Capture real Owner/Admin upload server action for authorization replay"
                );
                const before =
                  await sql`select count(*)::int as n from public.documents where project_id=${projectA}`;
                const attempt = await context.request.post(uploadRequest.url, {
                  headers: uploadRequest.headers,
                  data: uploadRequest.body,
                  maxRedirects: 0,
                });
                const body = await attempt.text();
                assert.ok(
                  !attempt.ok() || body.includes('"ok":false'),
                  "Unauthorized upload returns explicit error"
                );
                const after =
                  await sql`select count(*)::int as n from public.documents where project_id=${projectA}`;
                assert.deepEqual(after, before, "Denied upload did not create metadata");
              }
              if (actor.read) {
                await page.waitForLoadState("networkidle");
                await expect(page.getByTestId("project-header-profit")).not.toHaveText(/Loading/);
                if (actor.name !== "owner") {
                  for (const metric of ["contract-value", "collected", "profit"])
                    await expect(page.getByTestId(`project-header-${metric}`)).toHaveText(
                      "Unavailable"
                    );
                  for (const metric of ["need-collect", "actual-cost", "margin"])
                    await expect(page.getByTestId(`project-header-${metric}`)).not.toContainText(
                      "$"
                    );
                }
              }
              assert.deepEqual(pageErrors, [], "No browser runtime errors");
              if (actor.read)
                assert.deepEqual(consoleErrors, [], "No unexpected browser console errors");
              if (actor.read)
                assert.equal(
                  await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
                  false,
                  "No horizontal overflow"
                );
              results.push({
                role: actor.name,
                viewport,
                materialsRead: actor.read ? "PASS" : "DENY",
                materialSaveEditRefresh: actor.write ? "PASS" : "DENY",
                attachmentUploadReadRefresh: actor.write
                  ? "PASS"
                  : actor.read
                    ? "READ PASS / UPLOAD DENY"
                    : "DENY",
              });
            } finally {
              await context.close();
            }
          }
        );
      }
      await t.test(
        `Projects operations ${viewport.width} save-refresh and list regression`,
        async () => {
          const context = await browser.newContext({ baseURL, viewport });
          try {
            const login = await context.request.post("/api/auth/login", {
              headers: { Origin: baseURL },
              data: { email: actors[0].email, password: actors[0].password, redirect: "/projects" },
            });
            assert.equal(login.status(), 200);
            const page = await context.newPage();
            const projectLink =
              viewport.width >= 768
                ? page.getByRole("link", { name: `Open project ${marker} A`, exact: true })
                : page.locator(`a[href="/projects/${projectA}"]`).filter({ visible: true }).first();
            const errors = [];
            page.on("pageerror", (error) => errors.push(error.message));
            page.on("console", (message) => {
              if (message.type() === "error") errors.push(message.text());
            });
            await page.goto("/projects");
            await expect(projectLink).toBeVisible();
            await page.screenshot({
              path: `/tmp/hh-authz-projects-list-${viewport.width}-final.png`,
              fullPage: true,
            });
            await projectLink.click();
            await expect(page.locator(`[data-project-context="${projectA}"]`)).toBeVisible();
            await page.screenshot({
              path: `/tmp/hh-authz-project-overview-${viewport.width}-final.png`,
              fullPage: true,
            });
            assert.equal(
              await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
              false
            );
            await verifyProjectOperations({
              page,
              context,
              sql,
              projectA,
              projectCompany,
              remember,
              storagePaths,
              marker: workflowMarker,
              viewport,
            });
            assert.deepEqual(errors, []);
            results.push({
              role: "owner",
              projectsList: "PASS",
              projectOverview: "PASS",
              tasksSchedulePunchPhotosInspectionsChangeOrders: "PASS",
              viewport,
            });
          } finally {
            await context.close();
          }
        }
      );
    }
  } finally {
    await browser.close();
    writeFileSync("/tmp/hh-authz-browser-result.json", JSON.stringify(results, null, 2));
  }
}
