import { test, expect } from "@playwright/test";

const BASE = (process.env.E2E_BASE_URL || "").replace(/\/$/, "");
const isProd = /^https:\/\/hhprojectgroup\.com$/i.test(BASE);

test.describe("Production: Commission payments visibility", () => {
  test.skip(!isProd, "Set E2E_BASE_URL=https://hhprojectgroup.com");

  test("created commission appears in commission payments list", async ({ page }) => {
    const api: Array<{ status: number; url: string; body: string }> = [];
    page.on("response", async (res) => {
      const url = res.url();
      if (!url.includes("/api/projects/")) return;
      if (!url.includes("/commissions")) return;
      const status = res.status();
      const body = await res.text().catch(() => "");
      api.push({ status, url, body });
    });

    const seed = `E2E ${Date.now()}`;
    // Seed a commission via API to avoid relying on UI selectors.
    const projectsRes = await page.request.get("/api/projects");
    if (!projectsRes.ok()) throw new Error(`GET /api/projects failed: ${projectsRes.status()}`);
    const projectsJson = (await projectsRes.json()) as {
      ok: boolean;
      projects?: Array<{ id: string }>;
    };
    const projectId = projectsJson.projects?.[0]?.id;
    if (!projectId) throw new Error("No projects available to seed a commission.");

    const createRes = await page.request.post(`/api/projects/${projectId}/commissions`, {
      data: {
        person_name: seed,
        role: "Other",
        calculation_mode: "Auto",
        rate: 0.1,
        base_amount: 100,
        commission_amount: 10,
        status: "Pending",
        notes: null,
      },
    });
    const createBody = await createRes.text();
    if (!createRes.ok()) {
      throw new Error(
        `POST /api/projects/${projectId}/commissions failed: ${createRes.status()}\n${createBody}`
      );
    }

    // Go to finance commissions and ensure we can find the newly-created person name.
    await page.goto("/financial/commissions", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(seed, { exact: false })).toBeVisible({ timeout: 15000 });

    // If the API returned an error JSON but still 200, fail with details.
    const bad = api.filter((r) => r.status >= 400);
    expect(bad).toEqual([]);
  });

  test("record payment updates paid/outstanding", async ({ page }) => {
    const apiErrors: string[] = [];
    page.on("response", async (res) => {
      const url = res.url();
      if (!url.includes("/api/projects/")) return;
      if (!url.includes("/commissions/")) return;
      if (res.status() >= 400) {
        const body = await res.text().catch(() => "");
        apiErrors.push(`${res.status()} ${url}\n${body}`);
      }
    });

    await page.goto("/financial/commissions", { waitUntil: "domcontentloaded" });
    if (page.url().includes("/login")) throw new Error("Auth required (redirected to /login).");

    // Ensure we have at least one row. If empty, create a commission under the first project.
    const noRows = page.getByText(/no commissions/i, { exact: false });
    if (
      (await noRows.count()) > 0 &&
      (await noRows
        .first()
        .isVisible()
        .catch(() => false))
    ) {
      // Navigate to projects list and pick first project
      await page.goto("/projects", { waitUntil: "domcontentloaded" });
      const firstProject = page.locator("a[href^='/projects/']").first();
      await expect(firstProject).toBeVisible({ timeout: 10000 });
      const href = (await firstProject.getAttribute("href")) || "";
      if (!href) throw new Error("Could not find a project link to seed a commission.");

      await page.goto(href + "?tab=commission", { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: /\+\s*add commission/i }).click();
      await page.getByLabel("Person").fill(`E2E ${Date.now()}`);
      await page.getByLabel(/rate/i).fill("0.1");
      await page.getByLabel(/base amount/i).fill("100");
      await page.getByRole("button", { name: /create/i }).click();
      await page.waitForTimeout(800);

      await page.goto("/financial/commissions", { waitUntil: "domcontentloaded" });
    }

    // Click first Record Payment
    const recordBtn = page.getByRole("button", { name: /record payment/i }).first();
    await expect(recordBtn).toBeVisible({ timeout: 10000 });

    const paidCellBefore = page.locator("tbody tr").first().locator("td").nth(4);
    const paidBeforeText = (await paidCellBefore.innerText().catch(() => "")).trim();

    await recordBtn.click();
    await page.getByLabel(/amount/i).fill("1");
    await page
      .getByRole("button", { name: /record payment/i })
      .nth(1)
      .click()
      .catch(async () => {
        // modal button might be "Save" depending on component
        await page.getByRole("button", { name: /save|record/i }).click();
      });

    // Wait a moment for refresh to complete
    await page.waitForTimeout(1500);

    const paidAfterText = (await paidCellBefore.innerText().catch(() => "")).trim();
    expect(paidAfterText).not.toEqual(paidBeforeText);

    expect(apiErrors.join("\n\n")).toEqual("");
  });
});
