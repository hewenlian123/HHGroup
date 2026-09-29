import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";

// Fixture identities, invoices, and all database cleanup belong to the outer local test.
export async function verifyARSettlementWorkflows({ actor, invoices, sql, t, marker }) {
  const baseURL = process.env.E2E_BASE_URL || "http://localhost:3001";
  const origin = new URL(baseURL);
  assert.equal(origin.protocol, "http:");
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname));
  assert.equal(invoices.length, 3, "One independent invoice per viewport");
  const widths = (process.env.HH_AR_SETTLEMENT_AR_VIEWPORTS || "1440,768,390")
    .split(",")
    .map(Number);
  assert.ok(widths.length && widths.every((width) => [1440, 768, 390].includes(width)));
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [index, viewport] of [
      { width: 1440, height: 900 },
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
    ].entries()) {
      if (!widths.includes(viewport.width)) continue;
      const invoice = invoices[index];
      await t.test(
        `AR settlement UI ${viewport.width}: partial, paid, customer and project`,
        async () => {
          const context = await browser.newContext({ baseURL, viewport });
          context.setDefaultTimeout(30_000);
          await context.tracing.start({ screenshots: true, snapshots: true });
          const errors = [];
          let page;
          try {
            const login = await context.request.post("/api/auth/login", {
              headers: { Origin: origin.origin },
              data: { email: actor.email, password: actor.password, redirect: "/financial/ar" },
            });
            assert.equal(login.status(), 200, "Same-organization owner app login");
            page = await context.newPage();
            page.on("pageerror", (error) => errors.push(error.message));
            page.on("console", (message) => {
              if (message.type() === "error") errors.push(message.text());
            });
            const screenshot = async (state) => {
              assert.equal(
                await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
                false,
                `${state}: no page horizontal overflow`
              );
              await page.screenshot({
                path: `/tmp/hh-ar-${invoice.id}-${viewport.width}-${state}.png`,
                fullPage: true,
              });
            };
            const assertLedger = async (paid, count, status) => {
              const [row] = await sql`
              select i.id,i.project_id,i.customer_id,i.status,i.total,
                (select coalesce(sum(ip.amount),0) from public.invoice_payments ip
                 where ip.invoice_id=i.id and ip.status is distinct from 'Voided') as paid,
                (select count(*)::int from public.payments_received pr where pr.invoice_id=i.id) as receipts,
                (select count(*)::int from public.invoice_payments ip where ip.invoice_id=i.id) as allocations
              from public.invoices i where i.id=${invoice.id}`;
              assert.equal(row.project_id, invoice.project_id);
              assert.equal(row.customer_id, invoice.customer_id);
              assert.equal(Number(row.total), 10000);
              assert.equal(Number(row.paid), paid);
              assert.equal(row.receipts, count);
              assert.equal(row.allocations, count);
              assert.equal(row.status, status);
              const receipts =
                await sql`select project_id,customer_name from public.payments_received where invoice_id=${invoice.id}`;
              for (const receipt of receipts) {
                assert.equal(receipt.project_id, invoice.project_id);
                assert.equal(receipt.customer_name, invoice.customer_name);
              }
            };
            await page.goto(`/financial/invoices/${invoice.id}`);
            await expect(page.getByTestId("invoice-detail")).toBeVisible();
            await expect(page.getByTestId("invoice-detail-balance")).toContainText("$10,000.00");
            await screenshot("invoice-unpaid");

            for (const [step, amount] of [3000, 7000].entries()) {
              await page.getByRole("link", { name: "Record payment", exact: true }).first().click();
              const dialog = page.getByRole("dialog", { name: "Receive Payment" });
              await expect(dialog).toBeVisible();
              await expect(dialog.locator("select").first()).toHaveValue(invoice.id);
              await expect(dialog.getByPlaceholder("Customer name")).toHaveValue(
                invoice.customer_name
              );
              assert.equal(new URL(page.url()).searchParams.get("projectId"), invoice.project_id);
              await dialog.getByPlaceholder("0").fill(String(amount));
              const submit = dialog.getByRole("button", { name: "Receive Payment", exact: true });
              await screenshot(`receive-${amount}`);

              if (index === 0 && step === 0) {
                let injected = false;
                const keys = [];
                const intercept = async (route) => {
                  const req = route.request();
                  const body = req.postData() || "";
                  if (
                    req.method() !== "POST" ||
                    !req.headers()["next-action"] ||
                    !body.includes(invoice.id)
                  ) {
                    await route.continue();
                    return;
                  }
                  const key = body.match(/"idempotency_key"\s*:\s*"([^"]+)"/)?.[1];
                  if (!key) {
                    await route.continue();
                    return;
                  }
                  keys.push(key);
                  if (injected) {
                    await route.continue();
                    return;
                  }
                  const response = await route.fetch();
                  assert.ok(response.ok(), "Original payment action response succeeds");
                  const text = await response.text();
                  const replacement = text.replace(
                    /"ok"\s*:\s*true\s*,\s*"paymentId"\s*:\s*"[^"]+"/,
                    '"ok":false,"error":"Simulated lost acknowledgement; retry the same payment."'
                  );
                  assert.notEqual(
                    replacement,
                    text,
                    "Intercept a committed payment acknowledgement"
                  );
                  injected = true;
                  await route.fulfill({ response, body: replacement });
                };
                await page.route("**/financial/payments**", intercept);
                try {
                  await submit.click();
                  await expect.poll(() => injected).toBe(true);
                  await expect(submit).toBeEnabled();
                  await assertLedger(3000, 1, "Partially Paid");
                  await submit.click();
                  await expect(dialog).not.toBeVisible();
                  assert.equal(keys.length, 2, "One attempt plus one explicit safe retry");
                  assert.equal(
                    keys[0],
                    keys[1],
                    "Ambiguous acknowledgement retains the payment request identity"
                  );
                } finally {
                  await page.unroute("**/financial/payments**", intercept);
                }
              } else {
                await submit.click();
                await expect(dialog).not.toBeVisible();
              }

              await page.getByRole("link", { name: "View Invoice", exact: true }).click();
              await expect(page.getByTestId("invoice-detail-status")).toContainText(
                step === 0 ? "Partial" : "Paid"
              );
              await expect(page.getByTestId("invoice-detail-balance")).toContainText(
                step === 0 ? "$7,000.00" : "$0.00"
              );
              await assertLedger(
                step === 0 ? 3000 : 10000,
                step + 1,
                step === 0 ? "Partially Paid" : "Paid"
              );
              await screenshot(step === 0 ? "invoice-partial" : "invoice-paid");
            }

            await page.goto(`/customers/${invoice.customer_id}?tab=payments`);
            const history = page.getByRole("link", { name: "Open payments received", exact: true });
            await expect(history).toHaveAttribute(
              "href",
              `/financial/payments?customerId=${invoice.customer_id}`
            );
            await screenshot("customer-context");
            await history.click();
            await expect(
              page
                .getByRole("main")
                .getByText(invoice.invoice_no, { exact: viewport.width >= 1024 })
                .filter({ visible: true })
                .first()
            ).toBeVisible();
            await screenshot("customer-payments");

            await page.goto(`/financial/ar?customerId=${invoice.customer_id}`);
            const ledgerLinks = page.getByRole("link", { name: invoice.invoice_no, exact: true });
            await expect(ledgerLinks.first()).toBeVisible();
            const hrefs = await ledgerLinks.evaluateAll((links) =>
              links.map((link) => link.getAttribute("href"))
            );
            assert.ok(
              hrefs.some(
                (href) =>
                  href?.includes("paymentId=") && href.includes(`customerId=${invoice.customer_id}`)
              ),
              "Billing history links the authoritative customer and received payment"
            );
            await screenshot("billing-history");

            await page.goto(`/projects/${invoice.project_id}?tab=financial`);
            await expect(
              page.locator(`[data-project-context="${invoice.project_id}"]`)
            ).toBeVisible();
            await expect(
              page.getByRole("link", { name: invoice.invoice_no, exact: true })
            ).toBeVisible();
            await screenshot("project-financial");
            assert.deepEqual(errors, [], "No browser console or page errors");
            t.diagnostic(
              `${marker}: ${viewport.width}px partial3000 + final7000, 2 receipts/allocations, Paid balance0; context screenshots /tmp/hh-ar-${invoice.id}-${viewport.width}-*.png`
            );
          } finally {
            if (page && errors.length)
              t.diagnostic(JSON.stringify({ width: viewport.width, errors }));
            await context.tracing.stop({ path: `/tmp/hh-ar-${invoice.id}-${viewport.width}.zip` });
            await context.close();
          }
        }
      );
    }
  } finally {
    await browser.close();
  }
}

// Shares only the outer test's owned fixtures and exact teardown.
export async function verifyAPSettlementWorkflows({ actor, bills, sql, t }) {
  const baseURL = process.env.E2E_BASE_URL || "http://localhost:3001";
  const origin = new URL(baseURL);
  assert.equal(origin.protocol, "http:");
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname));
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [index, viewport] of [
      { width: 1440, height: 900 },
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
    ].entries()) {
      await t.test(`AP settlement UI ${viewport.width}: partial, paid and retry`, async () => {
        const bill = bills[index],
          context = await browser.newContext({ baseURL, viewport });
        context.setDefaultTimeout(30_000);
        await context.tracing.start({ screenshots: true, snapshots: true });
        const errors = [];
        try {
          const login = await context.request.post("/api/auth/login", {
            headers: { Origin: origin.origin },
            data: { email: actor.email, password: actor.password, redirect: `/bills/${bill}` },
          });
          assert.equal(login.status(), 200);
          const page = await context.newPage();
          page.on("pageerror", (error) => errors.push(error.message));
          page.on("console", (message) => {
            if (message.type() === "error") errors.push(message.text());
          });
          await page.goto(`/bills/${bill}`);
          for (const [step, amount] of [40, 60].entries()) {
            await page.getByRole("button", { name: "Add payment", exact: true }).click();
            const dialog = page.getByRole("dialog", { name: "Add payment" });
            await expect(dialog).toBeVisible();
            await dialog.getByPlaceholder("0.00", { exact: true }).fill(String(amount));
            const submit = dialog.getByRole("button", { name: "Add payment", exact: true });
            if (index === step) {
              let injected = false;
              const keys = [];
              const intercept = async (route) => {
                const body = route.request().postDataJSON();
                keys.push(body.idempotency_key);
                if (injected) {
                  await route.continue();
                  return;
                }
                const response = await route.fetch();
                assert.ok(response.ok());
                injected = true;
                await route.fulfill({
                  response,
                  json: {
                    ok: false,
                    outcome: "unknown",
                    message: "Simulated lost acknowledgement; retry this payment.",
                  },
                });
              };
              await page.route(`**/api/bills/${bill}/payments`, intercept);
              await submit.click();
              await expect.poll(() => injected).toBe(true);
              await expect(submit).toBeEnabled();
              await page.reload();
              await page.getByRole("button", { name: "Add payment", exact: true }).click();
              await expect(dialog.getByPlaceholder("0.00", { exact: true })).toHaveValue(
                String(amount)
              );
              await dialog.getByRole("button", { name: "Add payment", exact: true }).click();
              await expect(dialog).not.toBeVisible();
              assert.equal(keys.length, 2);
              assert.equal(keys[0], keys[1]);
              await page.unroute(`**/api/bills/${bill}/payments`, intercept);
            } else {
              await submit.click();
              await expect(dialog).not.toBeVisible();
            }
            const [row] =
              await sql`select amount,paid_amount,balance_amount,status,(select count(*)::int from public.ap_bill_payments where bill_id=${bill}) as payments from public.ap_bills where id=${bill}`;
            assert.equal(Number(row.amount), 100);
            assert.equal(Number(row.paid_amount), step === 0 ? 40 : 100);
            assert.equal(Number(row.balance_amount), step === 0 ? 60 : 0);
            assert.equal(row.payments, step + 1);
            await page.reload();
            await expect(
              page.getByText(step === 0 ? "Partially Paid" : "Paid", { exact: true }).first()
            ).toBeVisible();
            assert.equal(
              await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
              false
            );
            await page.screenshot({
              path: `/tmp/hh-ap-${bill}-${viewport.width}-${step}.png`,
              fullPage: true,
            });
          }
          assert.deepEqual(errors, []);
        } finally {
          if (errors.length) t.diagnostic(JSON.stringify({ width: viewport.width, errors }));
          await context.tracing.stop({ path: `/tmp/hh-ap-${bill}-${viewport.width}.zip` });
          await context.close();
        }
      });
    }
  } finally {
    await browser.close();
  }
}

export async function verifyEstimateInvoiceWorkflows({ actor, estimates, sql, t }) {
  const baseURL = process.env.E2E_BASE_URL || "http://localhost:3001",
    origin = new URL(baseURL);
  assert.equal(origin.protocol, "http:");
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname));
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [index, viewport] of [
      { width: 1440, height: 900 },
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
    ].entries()) {
      await t.test(
        `Estimate to approved Project and draft Invoice UI ${viewport.width}`,
        async () => {
          const fixture = estimates[index],
            context = await browser.newContext({ baseURL, viewport });
          context.setDefaultTimeout(45_000);
          await context.tracing.start({ screenshots: true, snapshots: true });
          const errors = [];
          try {
            const login = await context.request.post("/api/auth/login", {
              headers: { Origin: origin.origin },
              data: {
                email: actor.email,
                password: actor.password,
                redirect: `/estimates/${fixture.id}`,
              },
            });
            assert.equal(login.status(), 200);
            const page = await context.newPage();
            page.on("pageerror", (error) => errors.push(error.message));
            page.on("console", (message) => {
              if (message.type() === "error") errors.push(message.text());
            });
            const shot = async (state) => {
              assert.equal(
                await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
                false
              );
              await page.screenshot({
                path: `/tmp/hh-estimate-chain-${fixture.id}-${viewport.width}-${state}.png`,
                fullPage: true,
              });
            };
            const action = async (name) => {
              const button = page
                .getByRole("button", { name, exact: true })
                .filter({ visible: true });
              if (await button.count()) {
                await button.first().click();
                return;
              }
              await page
                .getByRole("button", {
                  name: viewport.width < 768 ? "More estimate actions" : "Estimate actions",
                  exact: true,
                })
                .click();
              await page.getByRole("menuitem", { name, exact: true }).click();
            };
            await page.goto(`/estimates/${fixture.id}`);
            await expect(page.getByTestId("estimate-detail-header")).toContainText("Draft");
            await shot("draft");
            await action("Mark as Sent");
            await expect(
              page.getByText("Sent", { exact: true }).filter({ visible: true }).first()
            ).toBeVisible();
            await action("Mark accepted");
            await expect(
              page.getByText("Approved", { exact: true }).filter({ visible: true }).first()
            ).toBeVisible();
            await shot("approved");
            await action("Convert to Project");
            const drawer = page.getByRole("dialog", { name: "Set up project" });
            await expect(drawer).toBeVisible();
            await drawer.getByLabel("Project name", { exact: true }).fill(fixture.name);
            await drawer.getByRole("button", { name: "Create project", exact: true }).click();
            await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+$/);
            const [project] =
              await sql`select id,customer_id,budget,snapshot_revenue,snapshot_budget_cost from public.projects where source_estimate_id=${fixture.id}`;
            assert.ok(project);
            assert.equal(project.customer_id, fixture.customerId);
            assert.equal(Number(project.budget), 100);
            assert.equal(Number(project.snapshot_revenue), 100);
            assert.equal(Number(project.snapshot_budget_cost), 100);
            await shot("project");
            await page.goto(`/estimates/${fixture.id}`);
            await expect(page.getByTestId("estimate-detail-header")).toContainText(
              "Converted to Project"
            );
            await action("Payment Schedule");
            const schedule = page.getByRole("region", { name: "Payment schedule", exact: true });
            await expect(schedule).toBeVisible();
            await schedule.getByRole("link", { name: "Create Draft Invoice", exact: true }).click();
            await expect(page.getByTestId("invoice-new-project-select")).toHaveValue(project.id);
            await page.getByRole("button", { name: "Create draft invoice", exact: true }).click();
            await expect(page).toHaveURL(/\/financial\/invoices\/[0-9a-f-]+\/preview/);
            const [invoice] =
              await sql`select i.id,i.project_id,i.customer_id,i.status,i.total,i.balance_due from public.invoices i join public.estimate_payment_schedule_items s on s.invoice_id=i.id where s.id=${fixture.scheduleId}`;
            assert.ok(invoice);
            assert.equal(invoice.project_id, project.id);
            assert.equal(invoice.customer_id, fixture.customerId);
            assert.equal(invoice.status, "Draft");
            assert.equal(Number(invoice.total), 100);
            assert.equal(Number(invoice.balance_due), 100);
            await page.reload();
            await expect(page.locator("[data-invoice-document-root]")).toBeVisible();
            await expect(page.getByTestId("invoice-preview-total")).toContainText("$100.00");
            await expect(page.locator("[data-invoice-document-root]")).toContainText(fixture.name);
            await shot("invoice-draft");
            assert.deepEqual(errors, []);
          } finally {
            if (errors.length) t.diagnostic(JSON.stringify({ width: viewport.width, errors }));
            await context.tracing.stop({
              path: `/tmp/hh-estimate-chain-${fixture.id}-${viewport.width}.zip`,
            });
            await context.close();
          }
        }
      );
    }
  } finally {
    await browser.close();
  }
}
