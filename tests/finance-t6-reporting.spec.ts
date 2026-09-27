import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { loadE2EProcessEnv } from "./e2e-load-env";
loadE2EProcessEnv();
const project = randomUUID();
const marker = `PW Finance T6 ${project}`;
function sql(query: string) {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:54321") throw Error("Local only");
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_hh-finance-audit-2026",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
    ],
    { input: query, encoding: "utf8" }
  );
}
test.beforeAll(() => {
  sql(`BEGIN; INSERT INTO projects(id,name,budget,contract_amount,status) VALUES('${project}','${marker}',0,0,'Active');
  INSERT INTO invoices(id,invoice_no,project_id,issue_date,due_date,status,subtotal,total,notes)
  SELECT gen_random_uuid(),'${marker} '||n,'${project}','2026-09-01','2026-09-20','Sent',1,1,'${marker}' FROM generate_series(1,2001) n; COMMIT;`);
});
test.afterAll(() => {
  sql(
    `BEGIN; DELETE FROM invoices WHERE project_id='${project}' AND notes='${marker}'; DELETE FROM projects WHERE id='${project}' AND name='${marker}'; COMMIT;`
  );
  expect(sql(`SELECT count(*) FROM invoices WHERE project_id='${project}';`).trim()).toBe("0");
});
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
]) {
  test(`T6 historical unavailable, legacy bookmark and 2001 records ${viewport.width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.waitForLoadState("networkidle");
    await page.goto("/reports?tab=ar-aging&asOf=2026-08-31");
    await expect(
      page.getByRole("status").filter({ hasText: "UNAVAILABLE WITH CURRENT DATA" })
    ).toBeVisible();
    await expect(page.getByTestId("metric-records")).toHaveCount(0);
    const bookmark =
      "/financial/dashboard?filter=preserve&page=2&returnTo=%2Freports%3Ftab%3Dap-aging";
    await page.waitForLoadState("networkidle");
    await page.goto(bookmark);
    await expect(page.getByText(/Legacy read-only Portfolio/)).toBeVisible();
    await page.getByRole("link").filter({ hasText: "Project Base Contract" }).click();
    await expect(page.getByTestId("metric-records")).toBeVisible();
    expect(new URL(page.url()).searchParams.get("returnTo")).toBe(bookmark);
    await page.waitForLoadState("networkidle");
    await page.getByRole("link", { name: "Back to source", exact: true }).click();
    await expect(page).toHaveURL(`http://localhost:3000${bookmark}`);
    await page.waitForLoadState("networkidle");
    await page.getByRole("link", { name: "Back to report", exact: true }).click();
    await expect(page).toHaveURL("http://localhost:3000/reports?tab=ap-aging");
    await page.waitForLoadState("networkidle");
    await page.goto("/finance");
    await expect(page.getByRole("heading", { name: "Finance Overview" })).toBeVisible();
    await expect(page.locator('a[href="/financial/dashboard"]')).toHaveCount(0);
    await page.waitForLoadState("networkidle");
    await page.goto(
      `/reports?period=custom&from=2026-09-01&to=2026-09-30&projectId=${project}&metric=invoicedRevenue`
    );
    await expect(page.getByTestId("metric-records").locator("li")).toHaveCount(2001);
    await expect(page.getByText(/2001 records · Total \$2,001.00/)).toBeVisible();
    const amounts = await page.getByTestId("metric-records").locator("li p").allTextContents();
    expect(amounts.every((text) => text.startsWith("$1.00"))).toBe(true);
    const layout = await page.evaluate(() => ({
      viewport: innerWidth,
      width: document.documentElement.scrollWidth,
    }));
    expect(layout.width).toBeLessThanOrEqual(layout.viewport);
    await info.attach("layout", { body: JSON.stringify(layout), contentType: "application/json" });
    await page.screenshot({ path: info.outputPath(`large-ledger-${viewport.width}.png`) });
    expect(errors).toEqual([]);
  });
}

test("T6 cash and historical availability text in light, dark and forced colors", async ({
  page,
}, info) => {
  await page.request.get("/dashboard/cashflow");
  await page.request.get("/reports?tab=ap-aging&asOf=2026-09-03");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  for (const theme of ["light", "dark", "forced"] as const) {
    await page.emulateMedia({
      colorScheme: theme === "dark" ? "dark" : "light",
      forcedColors: theme === "forced" ? "active" : "none",
    });
    await page.goto("/reports?tab=ap-aging&asOf=2026-09-03");
    await page.waitForLoadState("networkidle");
    await page.evaluate((theme) => {
      document.documentElement.classList.toggle("dark", theme === "dark");
    }, theme);
    const status = page.getByRole("status").filter({ hasText: "UNAVAILABLE WITH CURRENT DATA" });
    await expect(status).toBeVisible();
    const colors = await status.evaluate((element) => {
      const layers = [];
      for (let el: Element | null = element; el; el = el.parentElement) {
        const s = getComputedStyle(el);
        layers.push({ foreground: s.color, background: s.backgroundColor, opacity: s.opacity });
      }
      return layers;
    });
    await info.attach(`historical-colors-${theme}`, {
      body: JSON.stringify(colors),
      contentType: "application/json",
    });
    await page.screenshot({ path: info.outputPath(`historical-${theme}.png`) });
  }
  await page.goto("/dashboard/cashflow");
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Unavailable", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByText(/Paid Expenses and full Net Cash Flow are unavailable/)
  ).toBeVisible();
  expect(errors).toEqual([]);
});
