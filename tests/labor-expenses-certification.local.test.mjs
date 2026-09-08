import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { chromium, expect } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { assertDisposableCertificationTarget } from "./certification-target-guard.mjs";

// Explicit opt-in; isolated local fixtures, no global seed or broad cleanup hooks.
// HH_LABOR_EXPENSES_LOCAL_TEST=1 E2E_BASE_URL=http://127.0.0.1:3001 node --test tests/labor-expenses-certification.local.test.mjs
const viewports = [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
];
const local = (value) => {
  assert.ok(
    ["localhost", "127.0.0.1", "[::1]"].includes(new URL(value).hostname),
    "Remote targets refused"
  );
  return value;
};
function receiptPdf(marker) {
  const stream = `BT /F1 12 Tf 30 100 Td (${marker}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 150] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let text = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(text));
    text += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(text);
  text += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => String(offset).padStart(10, "0") + " 00000 n \n")
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(text);
}

function isExpectedNavigationCancellation(failure, baseURL, proxyURL) {
  if (failure.error !== "net::ERR_ABORTED") return false;
  const url = new URL(failure.url);
  if (url.pathname.startsWith("/auth/v1/")) return false;
  if (url.origin === new URL(proxyURL).origin)
    return (
      failure.method === "GET" &&
      url.pathname.startsWith("/storage/v1/object/sign/expense-attachments/")
    );
  if (url.origin !== new URL(baseURL).origin) return false;
  return (
    (failure.method === "GET" &&
      (/^\/(?:financial\/(?:accounts|inbox|expenses)|api\/(?:system-health|labor\/(?:workers\/[^/]+|payroll-summary)))$/.test(
        url.pathname
      ) ||
        url.pathname.startsWith("/_next/static/chunks/"))) ||
    (failure.method === "POST" && url.pathname === "/financial/accounts")
  );
}

async function addDisposableSession(context, apiUrl, anonKey, actor, baseURL, accessTokens) {
  let cookies = [];
  const client = createServerClient(apiUrl, anonKey, {
    cookies: {
      getAll: () => cookies,
      setAll: (next) => {
        cookies = next;
      },
    },
  });
  const { data, error } = await client.auth.signInWithPassword(actor);
  assert.equal(error, null, "Disposable Auth session is created directly");
  assert.ok(data.session?.access_token, "Disposable bearer token is present");
  accessTokens.add(data.session.access_token);
  await context.setExtraHTTPHeaders({ Authorization: `Bearer ${data.session.access_token}` });
  await context.addCookies(
    cookies.map(({ name, value, options }) => ({
      httpOnly: options?.httpOnly,
      name,
      sameSite:
        options?.sameSite === "strict" ? "Strict" : options?.sameSite === "none" ? "None" : "Lax",
      secure: options?.secure,
      url: baseURL,
      value,
    }))
  );
}

test(
  "Labor, receipt persistence, and Accounts local certification",
  { skip: process.env.HH_LABOR_EXPENSES_LOCAL_TEST !== "1", timeout: 1_800_000 },
  async (t) => {
    assert.equal(process.versions.node.split(".")[0], "22");
    const workdir = resolve(process.env.HH_CERTIFICATION_SUPABASE_WORKDIR || process.cwd());
    const expected = {
      projectId: process.env.HH_CERTIFICATION_PROJECT_ID,
      apiUrl: process.env.HH_CERTIFICATION_API_URL,
      databaseUrl: process.env.HH_CERTIFICATION_DATABASE_URL,
    };
    const status = JSON.parse(
      execFileSync(
        resolve(process.cwd(), "node_modules/.bin/supabase"),
        ["status", "-o", "json", "--workdir", workdir],
        {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        }
      )
    );
    const projectId = readFileSync(join(workdir, "supabase/config.toml"), "utf8").match(
      /^project_id\s*=\s*"([^"]+)"/m
    )?.[1];
    assertDisposableCertificationTarget({
      expected,
      actual: { projectId, apiUrl: status.API_URL, databaseUrl: status.DB_URL },
    });
    const sql = postgres(status.DB_URL, { max: 1, onnotice: () => {} });
    const [databaseIdentity] = await sql`select current_database() name`;
    assert.deepEqual(databaseIdentity, { name: "postgres" });
    const admin = createClient(status.API_URL, status.SECRET_KEY || status.SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const baseURL = local(process.env.E2E_BASE_URL || "http://127.0.0.1:3001");
    const proxyURL = local(process.env.HH_CERTIFICATION_PROXY_URL);
    assert.ok(Number(new URL(proxyURL).port) >= 57000, "Certification proxy port allowlist");
    assert.ok(Number(new URL(proxyURL).port) <= 57999, "Certification proxy port allowlist");
    const accessTokens = new Set();
    let certificationUser = null;
    const proxy = createServer(async (request, response) => {
      const target = new URL(request.url, status.API_URL);
      const cors = {
        "access-control-allow-headers":
          request.headers["access-control-request-headers"] ||
          "authorization,apikey,content-type,x-client-info",
        "access-control-allow-methods": "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS",
        "access-control-allow-origin": request.headers.origin || "*",
      };
      if (request.method === "OPTIONS") {
        response.writeHead(204, cors);
        response.end();
        return;
      }
      const body = [];
      for await (const chunk of request) body.push(chunk);
      if (target.pathname === "/auth/v1/user") {
        const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");
        if (!certificationUser || !token || !accessTokens.has(token)) {
          response.writeHead(401, { ...cors, "content-type": "application/json" });
          response.end(JSON.stringify({ message: "Invalid disposable certification session" }));
          return;
        }
        response.writeHead(200, { ...cors, "content-type": "application/json" });
        response.end(JSON.stringify(certificationUser));
        return;
      }
      const headers = { ...request.headers };
      delete headers.host;
      delete headers.connection;
      delete headers["content-length"];
      const upstream = await fetch(target, {
        method: request.method,
        headers,
        body: ["GET", "HEAD"].includes(request.method) ? undefined : Buffer.concat(body),
      });
      const payload = Buffer.from(await upstream.arrayBuffer());
      if (target.pathname === "/auth/v1/token" && upstream.ok) {
        const token = JSON.parse(payload.toString()).access_token;
        if (token) accessTokens.add(token);
      }
      response.writeHead(upstream.status, Object.fromEntries(upstream.headers));
      response.end(payload);
    });
    await new Promise((resolve, reject) => {
      proxy.once("error", reject);
      proxy.listen(Number(new URL(proxyURL).port), new URL(proxyURL).hostname, resolve);
    });
    const scope = process.env.HH_LABOR_EXPENSES_SCOPE || "all";
    assert.ok(["all", "readonly", "workflows"].includes(scope), "Explicit certification scope");
    const selectedWidth = Number(process.env.HH_LABOR_EXPENSES_WIDTH || 0);
    assert.ok([0, 1440, 768, 390].includes(selectedWidth), "Exact certification viewport");
    const marker = `Labor receipts ${randomUUID()}`;
    const output = await mkdtemp(join(tmpdir(), "hh-labor-expenses-"));
    console.log(
      `Certification started ${new Date().toISOString()}; scope=${scope}; viewport=${selectedWidth || "all"}; evidence=${output}`
    );
    const projects = [randomUUID(), randomUUID()];
    const companyProfileId = randomUUID();
    const organizationId = randomUUID();
    const customerId = randomUUID();
    const subcontractorId = randomUUID();
    const workers = viewports.map(() => [randomUUID(), randomUUID()]);
    const workerIds = workers.flat();
    const entries = viewports.map(() => [randomUUID(), randomUUID(), randomUUID()]);
    const reimbursementIds = viewports.map(() => [randomUUID(), randomUUID()]);
    const paymentAccount = randomUUID();
    const paymentOption = randomUUID();
    const receiptReferences = [],
      paths = new Set();
    const metadataTriggers = new Set();
    let userId, browser;
    t.diagnostic(
      `Evidence directory ${output}; Chromium; ${baseURL}; viewports ${JSON.stringify(viewports)}; Figma reference MISSING INPUT (functional/responsive scope only)`
    );
    t.after(async () => {
      if (browser) await browser.close();
      await new Promise((resolve) => proxy.close(resolve));
      try {
        for (const trigger of metadataTriggers) {
          await sql.unsafe(`drop trigger if exists "${trigger}" on public.attachments`);
          await sql.unsafe(`drop function if exists public."${trigger}"()`);
        }
        const ownedExpenseReferences = [
          ...receiptReferences,
          ...reimbursementIds.flat().map((id) => `REIM-${id}`),
        ];
        if (ownedExpenseReferences.length) {
          const expenses =
            await sql`select id from public.expenses where reference_no in ${sql(ownedExpenseReferences)}`;
          const ids = expenses.map((row) => row.id);
          if (ids.length) {
            const attachments =
              await sql`select file_path from public.attachments where entity_type='expense' and entity_id in ${sql(ids)}`;
            attachments.forEach((row) => paths.add(row.file_path));
            await sql`delete from public.attachments where entity_type='expense' and entity_id in ${sql(ids)}`;
            await sql`delete from public.expense_attachments where expense_id in ${sql(ids)}`;
            await sql`delete from public.expense_lines where expense_id in ${sql(ids)}`;
            await sql`delete from public.expenses where id in ${sql(ids)}`;
            for (const [table, foreignKey] of [
              ["expense_lines", "expense_id"],
              ["expense_attachments", "expense_id"],
              ["attachments", "entity_id"],
            ]) {
              const [remaining] =
                await sql`select count(*)::int n from ${sql(table)} where ${sql(foreignKey)} in ${sql(ids)}`;
              assert.equal(remaining.n, 0, `${table} owned expense graph residual0`);
            }
          }
          const [remaining] =
            await sql`select count(*)::int n from public.expenses where reference_no in ${sql(ownedExpenseReferences)} or (source='worker_reimbursement' and source_id in ${sql(reimbursementIds.flat())})`;
          assert.equal(remaining.n, 0, "Receipt and reimbursement mirror fixture DB residual0");
        }
        if (paths.size) {
          const removed = await admin.storage.from("expense-attachments").remove([...paths]);
          assert.equal(removed.error, null, "Exact receipt Storage cleanup");
          const [remaining] =
            await sql`select count(*)::int n from storage.objects where bucket_id='expense-attachments' and name in ${sql([...paths])}`;
          assert.equal(remaining.n, 0, "Receipt Storage residual0");
        }
        for (const table of [
          "labor_entries",
          "worker_reimbursements",
          "worker_advances",
          "worker_payments",
        ]) {
          await sql`delete from ${sql(table)} where worker_id in ${sql(workerIds)}`;
          const [remaining] =
            await sql`select count(*)::int n from ${sql(table)} where worker_id in ${sql(workerIds)}`;
          assert.equal(remaining.n, 0, `${table} residual0`);
        }
        await sql`delete from public.labor_workers where id in ${sql(workerIds)}`;
        await sql`delete from public.workers where id in ${sql(workerIds)}`;
        await sql`delete from public.projects where id in ${sql(projects)}`;
        await sql`delete from public.subcontractors where id=${subcontractorId}`;
        await sql`delete from public.customers where id=${customerId}`;
        await sql`delete from public.expense_options where id=${paymentOption}`;
        await sql`delete from public.payment_accounts where id=${paymentAccount}`;
        if (userId) {
          await sql`delete from public.accounts where user_id=${userId}`;
          await sql`delete from public.security_audit_events where user_id=${userId}`;
          await sql`delete from public.organization_memberships where user_id=${userId}`;
          assert.equal((await admin.auth.admin.deleteUser(userId)).error, null);
          await sql`delete from auth.audit_log_entries where payload->>'actor_id'=${userId} or payload->'traits'->>'user_id'=${userId}`;
          const [remaining] = await sql`select count(*)::int n from auth.users where id=${userId}`;
          assert.equal(remaining.n, 0, "Auth residual0");
        }
        await sql`delete from public.organizations where id=${organizationId}`;
        await sql`delete from public.company_profile where id=${companyProfileId}`;
        for (const [table, ids] of [
          ["workers", workerIds],
          ["labor_workers", workerIds],
          ["projects", projects],
          ["subcontractors", [subcontractorId]],
          ["customers", [customerId]],
          ["organizations", [organizationId]],
          ["company_profile", [companyProfileId]],
          ["payment_accounts", [paymentAccount]],
          ["expense_options", [paymentOption]],
        ]) {
          const [remaining] =
            await sql`select count(*)::int n from ${sql(table)} where id in ${sql(ids)}`;
          assert.equal(remaining.n, 0, `${table} residual0`);
        }
        t.diagnostic("Exact-owned DB, Storage, Auth fixture residuals: 0");
      } finally {
        await rm(join(output, "owner.json"), { force: true });
        await sql.end();
      }
    });
    await sql`insert into public.company_profile(id,org_name) values(${companyProfileId},${marker + " Company"})`;
    await sql`insert into public.organizations(id,name,legacy_company_profile_id) values(${organizationId},${marker + " Organization"},${companyProfileId})`;
    const [company] =
      await sql`select id from public.organizations where id=${organizationId} and legacy_company_profile_id=${companyProfileId}`;
    assert.deepEqual(company, { id: organizationId }, "Owned organization fixture is queryable");
    const actor = {
      email: `labor-receipts-${randomUUID()}@example.invalid`,
      password: `Hh!${randomUUID()}aA1`,
    };
    const created = await admin.auth.admin.createUser({
      ...actor,
      email_confirm: true,
      app_metadata: { role: "owner" },
    });
    assert.equal(created.error, null);
    userId = created.data.user.id;
    certificationUser = created.data.user;
    await sql`insert into public.organization_memberships(organization_id,user_id,role,status) values(${company.id},${userId},'owner','active')`;
    await sql`insert into public.customers(id,name,email,status) values(${customerId},${marker + " Customer"},'contact@example.invalid','active')`;
    await sql`insert into public.subcontractors(id,name,email,active) values(${subcontractorId},${marker + " Subcontractor"},'subcontractor@example.invalid',true)`;
    await sql`insert into public.projects ${sql(projects.map((id, index) => ({ id, name: `${marker} Project ${index + 1}`, organization_id: company.id, customer_id: index === 0 ? customerId : null })))}`;
    await sql`insert into public.payment_accounts(id,name,type) values(${paymentAccount},${marker + " Cash"},'cash')`;
    await sql`insert into public.expense_options(id,type,key,name,active,is_default,is_system,sort_order) values(${paymentOption},'payment_account',${paymentAccount},${marker + " Cash"},true,false,false,999)`;
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Pacific/Honolulu",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    for (const [index, pair] of workers.entries()) {
      await sql`insert into public.workers ${sql(pair.map((id) => ({ id, name: `${marker} Same Name ${index}`, status: "active", daily_rate: 100 })))}`;
      await sql`insert into public.labor_entries ${sql(entries[index].map((id, i) => ({ id, worker_id: i === 2 ? pair[1] : pair[0], project_id: projects[i === 1 ? 1 : 0], work_date: date, labor_cost_snapshot: [100, 200, 900][i], amount_snapshot: [100, 200, 900][i], cost_amount: [100, 200, 900][i], status: "Approved" })))}`;
      await sql`insert into public.worker_reimbursements ${sql(pair.map((id, i) => ({ id: reimbursementIds[index][i], worker_id: id, project_id: projects[0], amount: i ? 75 : 25, status: "pending", reimbursement_date: date })))}`;
      await sql`insert into public.worker_advances ${sql(pair.map((id, i) => ({ id: randomUUID(), worker_id: id, amount: i ? 15 : 10, status: "pending", advance_date: date })))}`;
    }
    browser = await chromium.launch({ headless: true });
    const authContext = await browser.newContext({ baseURL });
    await addDisposableSession(
      authContext,
      status.API_URL,
      status.ANON_KEY || status.PUBLISHABLE_KEY,
      actor,
      baseURL,
      accessTokens
    );
    await authContext.storageState({ path: join(output, "owner.json") });
    await authContext.close();

    if (scope !== "workflows")
      await t.test("Existing Labor and Accounts route / read-state matrix", async () => {
        const code = await new Promise((resolve, reject) => {
          const child = spawn(
            "./node_modules/.bin/playwright",
            [
              "test",
              "--config=playwright.ui.config.ts",
              "labor-workspace.spec.ts",
              "accounts-semantics.spec.ts",
              "finance-workspace.spec.ts",
              "contacts-workspace.spec.ts",
              "--retries=0",
              "--workers=1",
              ...(process.env.HH_LABOR_EXPENSES_UI_GREP
                ? ["--grep", process.env.HH_LABOR_EXPENSES_UI_GREP]
                : []),
            ],
            {
              stdio: "inherit",
              env: {
                ...process.env,
                E2E_BASE_URL: baseURL,
                E2E_WEB_SERVER: "off",
                E2E_UI_STORAGE_STATE: join(output, "owner.json"),
                E2E_UI_SESSION_EMAIL: actor.email,
                E2E_UI_SESSION_PASSWORD: actor.password,
                E2E_UI_AUTH_USER_ID: userId,
                E2E_UI_AUTH_USER_JSON: JSON.stringify(created.data.user),
                E2E_UI_CERTIFICATION: "1",
                HH_CERTIFICATION_PROXY_URL: proxyURL,
                NEXT_PUBLIC_SUPABASE_URL: proxyURL,
                SUPABASE_URL: proxyURL,
                NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY || status.PUBLISHABLE_KEY,
                SUPABASE_ANON_KEY: status.ANON_KEY || status.PUBLISHABLE_KEY,
                SUPABASE_DATABASE_URL: "",
                DATABASE_URL: "",
                SUPABASE_SERVICE_ROLE_KEY: "",
                SUPABASE_SECRET_KEY: "",
                E2E_UI_CUSTOMER_ID: customerId,
                E2E_UI_PROJECT_ID: projects[0],
                E2E_UI_WORKER_ID: workers[0][0],
                E2E_UI_OUTPUT_DIR: join(output, "readonly"),
                E2E_UI_REPORT_DIR: join(output, "readonly-report"),
              },
            }
          );
          child.on("error", reject);
          child.on("exit", resolve);
        });
        assert.equal(code, 0, "Existing readonly route/read-state matrix");
      });

    for (const [index, viewport] of viewports.entries())
      if (scope !== "readonly" && (!selectedWidth || selectedWidth === viewport.width))
        await t.test(
          `Stable worker attribution, receipt recovery and account persistence ${viewport.width}`,
          async () => {
            const context = await browser.newContext({
              baseURL,
              viewport,
            });
            await addDisposableSession(
              context,
              status.API_URL,
              status.ANON_KEY || status.PUBLISHABLE_KEY,
              actor,
              baseURL,
              accessTokens
            );
            context.setDefaultTimeout(30000);
            let page = await context.newPage();
            const errors = [],
              injectedErrors = [],
              requestFailures = [],
              expectedCancellations = [];
            const completedWriteResponses = new WeakSet();
            let expectMetadataFailure = false;
            const watchPage = (observedPage) => {
              observedPage.on("pageerror", (error) => errors.push(error.message));
              observedPage.on("response", (response) => {
                const request = response.request();
                if (
                  response.status() === 200 &&
                  request.method() === "POST" &&
                  new URL(response.url()).pathname === "/workers"
                )
                  completedWriteResponses.add(request);
              });
              observedPage.on("requestfailed", (request) => {
                const failure = {
                  url: request.url(),
                  method: request.method(),
                  error: request.failure()?.errorText,
                };
                const completedWorkerWrite =
                  completedWriteResponses.has(request) && failure.error === "net::ERR_ABORTED";
                if (
                  completedWorkerWrite ||
                  isExpectedNavigationCancellation(failure, baseURL, proxyURL)
                )
                  expectedCancellations.push(failure);
                else requestFailures.push(failure);
              });
              observedPage.on("console", (message) => {
                if (message.type() !== "error") return;
                if (
                  expectMetadataFailure &&
                  injectedErrors.length === 0 &&
                  message.location().url.includes("/api/financial/expenses/quick-expense") &&
                  /server responded with a status of 500/.test(message.text())
                )
                  injectedErrors.push(message.text());
                else errors.push(message.text());
              });
            };
            watchPage(page);
            const screenshot = async (state) => {
              assert.ok(
                (await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 2,
                `${state}: no page overflow`
              );
              await page.screenshot({
                path: join(output, `${viewport.width}-${state}.png`),
                fullPage: true,
              });
            };
            const accountRefresh = async () => {
              const response = await page.waitForResponse(
                (response) =>
                  new URL(response.url()).pathname === "/financial/accounts" &&
                  response.request().method() === "GET" &&
                  response.request().headers().rsc === "1"
              );
              assert.equal(response.status(), 200, "Account mutation refresh succeeds");
            };
            const json = async (path) => {
              const response = await context.request.get(path);
              assert.equal(response.status(), 200, path);
              return response.json();
            };
            try {
              const pair = workers[index];
              await page.goto("/workers");
              const workerRow = page
                .locator(
                  '[data-testid="worker-center-row"], [data-testid="worker-center-mobile-cards"] > [role="button"]'
                )
                .filter({ hasText: `${marker} Same Name ${index}` })
                .filter({ hasText: "$315.00" })
                .filter({ visible: true });
              await expect(workerRow).toHaveCount(1);
              await workerRow
                .getByRole("button", {
                  name: `Actions for ${marker} Same Name ${index}`,
                  exact: true,
                })
                .click();
              await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
              const workerEdit = page.getByRole("dialog", { name: "Edit Worker", exact: true });
              await workerEdit
                .getByText("Notes", { exact: true })
                .locator("..")
                .locator("input")
                .fill("Exact worker edit certification");
              const workerSaved = page.waitForResponse(
                (response) =>
                  new URL(response.url()).pathname === "/workers" &&
                  response.request().method() === "POST"
              );
              await workerEdit.getByRole("button", { name: "Save", exact: true }).click();
              assert.equal((await workerSaved).status(), 200, "Worker edit action succeeds");
              await expect(page.getByText("Saved", { exact: true })).toBeVisible();
              await expect
                .poll(async () => {
                  const [saved] = await sql`select notes from public.workers where id=${pair[0]}`;
                  return saved.notes;
                })
                .toBe("Exact worker edit certification");
              const [projection] =
                await sql`select id,name from public.labor_workers where id=${pair[0]}`;
              assert.equal(projection.id, pair[0]);
              assert.equal(projection.name, `${marker} Same Name ${index}`);
              await page.waitForLoadState("networkidle");
              await page.reload();
              await expect(workerRow).toHaveCount(1);
              await screenshot("worker-edit-persisted");
              const first = await json(`/api/labor/workers/${pair[0]}/balance`),
                second = await json(`/api/labor/workers/${pair[1]}/balance`);
              assert.deepEqual(first.summary, {
                laborOwed: 300,
                reimbursements: 25,
                payments: 0,
                advances: 10,
                balance: 315,
              });
              assert.deepEqual(second.summary, {
                laborOwed: 900,
                reimbursements: 75,
                payments: 0,
                advances: 15,
                balance: 960,
              });
              await page.goto("/labor/worker-balances");
              for (const [i, balance] of [
                [0, "$315.00"],
                [1, "$960.00"],
              ])
                await expect(
                  page
                    .locator(
                      `[data-testid="worker-balance-row-${pair[i]}"], [data-testid="worker-balance-card-${pair[i]}"]`
                    )
                    .filter({ visible: true })
                ).toContainText(balance);
              await screenshot("same-name-independent-balances");
              const payrollLoaded = page.waitForResponse(
                (response) =>
                  new URL(response.url()).pathname === "/api/labor/payroll-summary" &&
                  response.request().method() === "GET"
              );
              await page.goto("/labor/payroll");
              const payrollResponse = await payrollLoaded;
              assert.equal(payrollResponse.status(), 200, "Payroll summary load succeeds");
              const payroll = await payrollResponse.json();
              assert.equal(
                payroll.rows.find((row) => row.workerId === pair[0])?.balance,
                315,
                "Payroll API preserves the worker's exact payable balance"
              );
              await expect(page.locator("[data-labor-read-state]")).toHaveCount(0);
              const payrollRow = page
                .locator('tr[role="link"], div.space-y-3.p-3')
                .filter({ hasText: `${marker} Same Name ${index}` })
                .filter({ hasText: "$315.00" })
                .filter({ has: page.getByRole("button", { name: "Pay Worker", exact: true }) })
                .filter({ visible: true });
              await expect(payrollRow).toHaveCount(1);
              await payrollRow.getByRole("button", { name: "Pay Worker", exact: true }).click();
              const payDialog = page.getByRole("dialog", { name: "Pay Worker", exact: true });
              await payDialog.locator("select").nth(0).selectOption(projects[0]);
              await payDialog.locator('input[type="number"]').fill("125");
              await payDialog.locator("select").nth(1).selectOption("Cash");
              await screenshot("payroll-payment-review");
              const paymentResponse = page.waitForResponse(
                (response) =>
                  new URL(response.url()).pathname === `/api/labor/workers/${pair[0]}/pay` &&
                  response.request().method() === "POST"
              );
              await payDialog.getByRole("button", { name: "Confirm Payment", exact: true }).click();
              const committed = await paymentResponse;
              assert.equal(committed.status(), 200, await committed.text());
              const payment = committed.request().postDataJSON();
              assert.equal(payment.project_id, projects[0]);
              assert.ok(payment.idempotency_key, "UI payment owns a stable retry key");
              await expect(payDialog).not.toBeVisible();
              const replay = await context.request.post(`/api/labor/workers/${pair[0]}/pay`, {
                headers: { Origin: baseURL },
                data: payment,
              });
              assert.equal(replay.status(), 200, await replay.text());
              const paid = await json(`/api/labor/workers/${pair[0]}/balance`),
                unchanged = await json(`/api/labor/workers/${pair[1]}/balance`);
              assert.equal(paid.summary.payments, 125);
              assert.equal(paid.payments.length, 1);
              assert.equal(paid.summary.balance, 190);
              assert.deepEqual(
                unchanged.summary,
                second.summary,
                "Same-name worker unchanged by another worker payment"
              );
              for (const [project, expected] of [
                [projects[0], 125],
                [projects[1], 0],
              ]) {
                const summary = await json(
                  `/api/labor/payroll-summary?fromDate=${date}&toDate=${date}&projectId=${project}`
                );
                assert.equal(
                  summary.rows.find((row) => row.workerId === pair[0]).paid,
                  expected,
                  "Project attribution follows persisted settlement metadata"
                );
              }
              await page.goto(
                `/workers/${pair[0]}?tab=payments&projectId=${projects[0]}&returnTo=%2Flabor%2Foverview`
              );
              const paymentsTab = page.getByRole("tab", { name: "Payments", exact: true });
              await expect(paymentsTab).toBeVisible();
              if ((await paymentsTab.getAttribute("aria-selected")) !== "true") {
                await paymentsTab.click();
              }
              await expect(page.getByRole("tabpanel")).toContainText("125.00", {
                timeout: 30_000,
              });
              await screenshot("worker-payment-history");
              await page.goto("/labor/payroll");
              await expect(
                page.getByRole("heading", { name: "Payroll Summary", exact: true })
              ).toBeVisible();
              await page
                .getByRole("combobox", { name: "Project", exact: true })
                .selectOption(projects[0]);
              await expect(page.locator("[data-labor-read-state]")).toHaveCount(0);
              await screenshot("payroll-project-attribution");

              await page.goto("/financial/accounts");
              await expect(page.getByText("Total accounts", { exact: true })).toBeVisible();
              await expect(
                page.getByText("Bank reconciliation unavailable", { exact: true })
              ).not.toBeVisible();
              await page
                .getByRole("button", { name: /^Add account$/i })
                .filter({ visible: true })
                .click();
              let accountDialog = page.getByRole("dialog");
              const independentAccountsRead = async (name, visible) => {
                const verifierContext = await browser.newContext({ baseURL, viewport });
                await addDisposableSession(
                  verifierContext,
                  status.API_URL,
                  status.ANON_KEY || status.PUBLISHABLE_KEY,
                  actor,
                  baseURL,
                  accessTokens
                );
                const verifierPage = await verifierContext.newPage();
                watchPage(verifierPage);
                await verifierPage.goto("/financial/accounts", { waitUntil: "networkidle" });
                await expect(
                  verifierPage.getByText("Total accounts", { exact: true })
                ).toBeVisible();
                const persisted = verifierPage
                  .getByText(name, { exact: true })
                  .filter({ visible: true });
                if (visible) await expect(persisted).toBeVisible();
                else await expect(persisted).toHaveCount(0);
                await verifierContext.close();
              };
              const accountName = `${marker} ${viewport.width} Cash`;
              await accountDialog.getByPlaceholder("e.g. Chase Ink, BoA Bank").fill(accountName);
              await accountDialog
                .getByRole("combobox", { name: "Account type" })
                .selectOption("Cash");
              const createdAccountRefresh = accountRefresh();
              await accountDialog
                .getByRole("button", { name: "Save account", exact: true })
                .click();
              await expect(accountDialog).not.toBeVisible();
              await createdAccountRefresh;
              await independentAccountsRead(accountName, true);
              await expect(
                page.getByText(accountName, { exact: true }).filter({ visible: true })
              ).toBeVisible();
              const [account] =
                await sql`select name,type,user_id from public.accounts where user_id=${userId} and name=${accountName}`;
              assert.deepEqual(account, { name: accountName, type: "Cash", user_id: userId });
              await screenshot("account-cash-persisted");
              await page
                .getByRole("button", { name: `Actions for ${accountName}`, exact: true })
                .filter({ visible: true })
                .click();
              await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
              await accountDialog.getByPlaceholder("Optional").fill("Updated through account edit");
              const editedAccountRefresh = accountRefresh();
              await accountDialog
                .getByRole("button", { name: "Save changes", exact: true })
                .click();
              await expect(accountDialog).not.toBeVisible();
              await editedAccountRefresh;
              await independentAccountsRead(accountName, true);
              const [updatedAccount] =
                await sql`select notes from public.accounts where user_id=${userId} and name=${accountName}`;
              assert.equal(updatedAccount.notes, "Updated through account edit");
              await screenshot("account-edited");
              await page
                .getByRole("button", { name: `Actions for ${accountName}`, exact: true })
                .filter({ visible: true })
                .click();
              await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
              const deletedAccountRefresh = accountRefresh();
              await page
                .getByRole("dialog", { name: "Delete account?", exact: true })
                .getByRole("button", { name: "Delete", exact: true })
                .click();
              await expect(
                page.getByText(accountName, { exact: true }).filter({ visible: true })
              ).toHaveCount(0);
              await expect
                .poll(
                  async () => {
                    const [deletedAccount] =
                      await sql`select count(*)::int n from public.accounts where user_id=${userId} and name=${accountName}`;
                    return deletedAccount.n;
                  },
                  { message: "Account delete persists after the asynchronous action" }
                )
                .toBe(0);
              await deletedAccountRefresh;
              await independentAccountsRead(accountName, false);
              await expect(
                page.getByText(accountName, { exact: true }).filter({ visible: true })
              ).toHaveCount(0);
              await screenshot("account-deleted");

              const file = {
                name: `receipt-${randomUUID()}.pdf`,
                mimeType: "application/pdf",
                buffer: receiptPdf(`${marker} ${viewport.width}`),
              };
              const reference =
                "INBOX-UP-" + createHash("sha256").update(file.buffer).digest("hex");
              receiptReferences.push(reference);
              const metadataTrigger = `hh_receipt_${randomUUID().replaceAll("-", "")}`;
              if (index === 0) {
                const hash = reference.slice("INBOX-UP-".length);
                const attachmentId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
                metadataTriggers.add(metadataTrigger);
                await sql.unsafe(
                  `create function public."${metadataTrigger}"() returns trigger language plpgsql as $$ begin if new.id='${attachmentId}'::uuid then raise exception 'Injected owned receipt metadata failure'; end if; return new; end $$`
                );
                await sql.unsafe(
                  `create trigger "${metadataTrigger}" before insert on public.attachments for each row execute function public."${metadataTrigger}"()`
                );
                expectMetadataFailure = true;
              }
              await page.goto("/financial/receipt-queue");
              await expect(page).toHaveURL(/\/financial\/inbox/);
              await page
                .getByRole("button", { name: /upload receipt/i })
                .filter({ visible: true })
                .first()
                .click();
              const upload = page.getByRole("dialog");
              await upload.locator('input[type="file"][multiple]').setInputFiles(file);
              let intercepted = false;
              const uploadPaths = [];
              await page.route("**/api/quick-expense/upload-attachment", async (route) => {
                const response = await route.fetch();
                const body = await response.json();
                if (body.path) {
                  paths.add(body.path);
                  uploadPaths.push(body.path);
                }
                await route.fulfill({ response });
              });
              await page.route("**/api/financial/expenses/quick-expense", async (route) => {
                const response = await route.fetch();
                assert.equal(response.status(), index === 0 ? 500 : 200);
                intercepted = true;
                if (index === 0) {
                  await route.fulfill({ response });
                  return;
                }
                const body = await response.json();
                assert.ok(body.expense?.id);
                await route.fulfill({
                  status: 200,
                  json: {
                    ok: false,
                    message: "Receipt saved; acknowledgement lost. Retry the same file.",
                  },
                });
              });
              await upload.getByRole("button", { name: /Confirm Upload \(1\)/ }).click();
              await expect(
                upload.getByRole("button", { name: /Retry failed \(1\)/ })
              ).toBeVisible();
              assert.equal(intercepted, true);
              const [draft] =
                await sql`select id,status from public.expenses where reference_no=${reference}`;
              assert.equal(draft.status, "draft");
              await screenshot(
                index === 0 ? "receipt-metadata-missing" : "receipt-lost-acknowledgement"
              );
              if (index === 0) {
                const [missing] =
                  await sql`select count(*)::int n from public.attachments where entity_type='expense' and entity_id=${draft.id}`;
                assert.equal(missing.n, 0, "Expense committed before injected metadata failure");
                await sql.unsafe(`drop trigger "${metadataTrigger}" on public.attachments`);
                await sql.unsafe(`drop function public."${metadataTrigger}"()`);
                metadataTriggers.delete(metadataTrigger);
              }
              await page.unroute("**/api/financial/expenses/quick-expense");
              await upload.getByRole("button", { name: /Retry failed \(1\)/ }).click();
              if (index === 0) await expect(upload).not.toBeVisible();
              else await expect(upload.getByText(/already in Inbox/i)).toBeVisible();
              expectMetadataFailure = false;
              assert.equal(
                new Set(uploadPaths).size,
                1,
                "Retry reuses one immutable Storage object"
              );
              assert.equal(uploadPaths.length, index === 0 ? 2 : 1);
              await page.goto("/financial/inbox");
              await page.reload();
              const row = page
                .locator(`.exp-row[data-expense-id="${draft.id}"]`)
                .filter({ visible: true });
              await expect(row).toBeVisible();
              const [counts] =
                await sql`select (select count(*)::int from public.expenses where reference_no=${reference}) expenses,(select count(*)::int from public.attachments where entity_type='expense' and entity_id=${draft.id}) attachments`;
              assert.deepEqual(
                counts,
                { expenses: 1, attachments: 1 },
                "Retry/reload retains one expense and one original attachment"
              );
              await screenshot("receipt-recovered-draft");
              await row.click();
              const edit = page.locator("[data-expense-detail-panel]");
              await expect(edit).toBeVisible();
              await screenshot("receipt-review-open");
              await edit
                .getByTestId("edit-expense-vendor-input")
                .fill(`${marker} Vendor ${viewport.width}`);
              await edit.locator('input[type="number"]').first().fill("12.34");
              await edit.getByRole("combobox", { name: "Classification", exact: true }).click();
              await page.getByRole("option", { name: "Project Cost", exact: true }).click();
              await edit.getByRole("combobox", { name: "Project", exact: true }).click();
              await page.getByRole("option", { name: `${marker} Project 1`, exact: true }).click();
              await edit.locator("#edit-expense-category-select").click();
              await page.getByRole("option", { name: "Materials", exact: true }).click();
              await edit.locator("summary").filter({ hasText: "More Details" }).click();
              await edit.locator("#edit-expense-payment-method-select").click();
              await page.getByRole("option", { name: "Cash", exact: true }).click();
              await edit.locator("#edit-expense-payment-select").click();
              await page.getByRole("option", { name: marker + " Cash", exact: true }).click();
              await edit.getByRole("button", { name: "Save", exact: true }).click();
              await expect
                .poll(async () => {
                  const [saved] =
                    await sql`select vendor_name,total from public.expenses where id=${draft.id}`;
                  return { vendor: saved.vendor_name, total: Number(saved.total) };
                })
                .toEqual({ vendor: `${marker} Vendor ${viewport.width}`, total: 12.34 });
              await expect(edit).toBeVisible();
              await expect(edit.getByTestId("edit-expense-vendor-input")).toHaveValue(
                `${marker} Vendor ${viewport.width}`
              );
              await screenshot("receipt-reviewed");
              await edit.getByRole("button", { name: /^Approve(?: & Next)?$/ }).click();
              await expect
                .poll(async () => {
                  const [saved] =
                    await sql`select status from public.expenses where id=${draft.id}`;
                  return saved.status;
                })
                .toBe("approved");
              await expect(page.getByText("Approved", { exact: true }).last()).toBeVisible();
              await expect(edit).not.toBeVisible();
              const [approved] =
                await sql`select project_id,payment_account_id,total from public.expenses where id=${draft.id}`;
              assert.equal(approved.project_id, projects[0]);
              assert.equal(approved.payment_account_id, paymentAccount);
              assert.equal(Number(approved.total), 12.34);
              await page.goto("/financial/expenses");
              await page
                .getByRole("button", { name: /^Filters 1$/ })
                .filter({ visible: true })
                .click();
              await page.getByRole("button", { name: "Clear", exact: true }).click();
              const approvedRow = page
                .locator(`.exp-row[data-expense-id="${draft.id}"]`)
                .filter({ visible: true });
              await expect(approvedRow).toBeVisible({ timeout: 30_000 });
              await page
                .locator('input[aria-label="Search expenses"]')
                .filter({ visible: true })
                .fill(`Vendor ${viewport.width}`);
              await expect(approvedRow).toBeVisible({ timeout: 30_000 });
              await expect(page.locator(".exp-row").filter({ visible: true })).toHaveCount(1);
              await screenshot("receipt-approved-archive");
              assert.deepEqual(errors, [], "Unexpected browser console and page errors");
              assert.deepEqual(requestFailures, [], "Unexpected browser request failures");
            } finally {
              await writeFile(
                join(output, `${viewport.width}-console-errors.json`),
                JSON.stringify(
                  {
                    unexpected: errors,
                    injected: injectedErrors,
                    requestFailures,
                    expectedCancellations,
                  },
                  null,
                  2
                )
              );
              await context.close();
            }
          }
        );
  }
);
