import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { getE2EOwnerCredentials } from "./e2e-auth-owner";
import { expect, test } from "@playwright/test";
import { loginAsE2EOwner, gotoWithE2EAuth } from "./e2e-auth-owner";

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
]) {
  test(`Expense Operations navigation and source pagination ${viewport.width}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("requestfailed", (request) =>
      console.log("Failed request", request.url(), request.failure())
    );
    await loginAsE2EOwner(page, "/financial/inbox");
    const operations = await page.request.get("/api/expenses/operations");
    expect(operations.ok(), await operations.text()).toBe(true);
    page.on("response", async (response) => {
      if (response.status() >= 400 && new URL(response.url()).pathname.startsWith("/api/"))
        console.log("Failed API", response.url(), response.status(), await response.text());
    });
    for (const [path, label] of [
      ["/financial/inbox", "Review"],
      ["/financial/expenses", "Ledger"],
      ["/financial/expenses/intake", "Intake"],
      ["/labor/reimbursements", "Reimbursements"],
    ]) {
      await gotoWithE2EAuth(page, path);
      const nav = page.getByRole("navigation", { name: "Expense Operations workspace" }).first();
      await expect(nav).toBeVisible({ timeout: 60_000 });
      await expect(nav.getByRole("link")).toHaveCount(4);
      await expect(nav.getByRole("link", { name: label, exact: true })).toHaveAttribute(
        "aria-current",
        "page"
      );
      await expect(page.getByText("Expenses unavailable", { exact: true })).toHaveCount(0);
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
        .toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`${label}-${viewport.width}.png`),
        fullPage: true,
      });
    }
    await gotoWithE2EAuth(page, "/financial/expenses/intake?source=worker&size=50&page=1");
    await expect(
      page
        .getByRole("navigation", { name: "Intake sources" })
        .getByRole("link", { name: "worker", exact: true })
    ).toHaveAttribute("aria-current", "page");
    await expect(page.getByText(/50 sources per page/)).toBeVisible();
    await page
      .getByRole("navigation", { name: "Intake page size" })
      .getByRole("link", { name: "100", exact: true })
      .click();
    await expect(page.getByText(/100 sources per page/)).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.goto("/financial/expenses/overview?date_kind=all");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/financial\/inbox\?date_kind=all$/);
    expect(errors).toEqual([]);
  });
}

test("Review persists request, resolution, approval and Post without another expense", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  expect(["127.0.0.1", "localhost"]).toContain(new URL(url).hostname);
  await loginAsE2EOwner(page, "/financial/inbox");
  const client = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const auth = await client.auth.signInWithPassword(await getE2EOwnerCredentials());
  expect(auth.error).toBeNull();
  const created = await client.rpc("create_expense_atomic", {
    p_idempotency_key: randomUUID(),
    p_payload: {
      expenseDate: new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" }),
      vendorName: "Operations local workflow fixture",
      paymentMethod: "Other",
      sourceType: "company",
      status: "needs_review",
      groups: [
        {
          projectId: null,
          lines: [
            {
              projectId: null,
              category: "Office",
              amount: 17.25,
              memo: "Local workflow validation",
            },
          ],
        },
      ],
    },
  });
  expect(created.error).toBeNull();
  const id = created.data.expense_id;
  const next = await client.rpc("create_expense_atomic", {
    p_idempotency_key: randomUUID(),
    p_payload: {
      expenseDate: new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" }),
      vendorName: "Operations next review fixture",
      paymentMethod: "Other",
      sourceType: "company",
      status: "needs_review",
      groups: [{ projectId: null, lines: [{ projectId: null, category: "Office", amount: 1.25 }] }],
    },
  });
  expect(next.error).toBeNull();

  await gotoWithE2EAuth(page, `/financial/inbox?date_kind=all&sort=amount%7Cdesc&ops_record=${id}`);
  const review = page.getByRole("region", { name: "Review and audit" });
  await expect(review.getByText("Unknown / Legacy", { exact: true })).toBeVisible();
  await review.getByText("Request Info or flag an issue", { exact: true }).click();
  await review.getByRole("textbox", { name: "Review message" }).fill("Confirm supporting evidence");
  await review.getByRole("button", { name: "Request Info", exact: true }).click();
  await expect(review.getByText("Needs information", { exact: true })).toBeVisible();
  await page.reload();
  await expect(review.getByText("Confirm supporting evidence", { exact: true })).toBeVisible();
  await review.getByRole("button", { name: "Respond / resolve" }).click();
  await review
    .getByRole("textbox", { name: "Resolution evidence" })
    .fill("Evidence confirmed by local test");
  await review.getByRole("button", { name: "Resolve with evidence" }).click();
  await expect(review.getByText("Needs information", { exact: true })).toHaveCount(0);
  const before = await (await page.request.get(`/api/expenses/${id}/operations`)).json();
  await expect(page.getByRole("button", { name: "Approve & Next", exact: true })).toBeVisible({
    timeout: 10000,
  });
  const approvalResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/expenses/${id}/operations`) &&
      response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Approve & Next", exact: true }).click();
  const approved = await approvalResponse;
  expect(approved.ok(), await approved.text()).toBe(true);
  await gotoWithE2EAuth(page, `/financial/expenses?date_kind=all&ops_record=${id}`);
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(review).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`quick-look-${width}.png`), fullPage: true });
  }
  await review.getByRole("button", { name: "Post", exact: true }).click();
  await expect(review.getByText("Posted", { exact: true })).toBeVisible();
  const after = await (await page.request.get(`/api/expenses/${id}/operations`)).json();
  expect(after.expense.id).toBe(id);
  expect(after.expense.lines.map((line: { id: string }) => line.id)).toEqual(
    before.expense.lines.map((line: { id: string }) => line.id)
  );
  expect(after.events.map((event: { action: string }) => event.action)).toEqual(
    expect.arrayContaining(["request_info", "resolve", "approve", "post"])
  );
  expect(after.issues[0].resolution).toBe("Evidence confirmed by local test");
  expect(errors).toEqual([]);
  await client.auth.signOut();
});
