import { test, expect } from "@playwright/test";

import { assertE2EBaseUrlSafeForMutations } from "./e2e-supabase-url-guard";

const BASE = (process.env.E2E_BASE_URL || "").replace(/\/$/, "");
const isProd = /^https:\/\/hhprojectgroup\.com$/i.test(BASE);

type CreatedCommission = { projectId: string; commissionId: string };

async function createMarkerCommission(page: import("@playwright/test").Page): Promise<{
  projectId: string;
  commissionId: string;
  personName: string;
}> {
  const marker = `PROD-SMOKE-COMMISSION-${Date.now()}`;
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
      person_name: marker,
      role: "Other",
      calculation_mode: "Manual",
      rate: 0,
      base_amount: 100,
      commission_amount: 10,
      status: "Pending",
      notes: `${marker} safe to delete`,
    },
  });
  const createBodyText = await createRes.text();
  if (!createRes.ok()) {
    throw new Error(
      `POST /api/projects/${projectId}/commissions failed: ${createRes.status()}\n${createBodyText}`
    );
  }
  const createBody = JSON.parse(createBodyText) as {
    ok?: boolean;
    commission?: { id?: string };
  };
  const commissionId = createBody.commission?.id;
  if (!createBody.ok || !commissionId) {
    throw new Error(`Commission create did not return id: ${createBodyText}`);
  }
  return { projectId, commissionId, personName: marker };
}

async function cleanupMarkerCommission(
  page: import("@playwright/test").Page,
  created: CreatedCommission | null
): Promise<void> {
  if (!created) return;
  const response = await page.request.delete(
    `/api/projects/${created.projectId}/commissions/${created.commissionId}`
  );
  if (!response.ok() && response.status() !== 404) {
    throw new Error(
      `Cleanup failed for marker commission ${created.commissionId}: ${response.status()} ${await response.text()}`
    );
  }
}

test.describe("Production: Commission payments visibility", () => {
  test.skip(!isProd, "Set E2E_BASE_URL=https://hhprojectgroup.com");

  test.beforeEach(() => {
    assertE2EBaseUrlSafeForMutations(BASE, "production commission write smoke");
  });

  test("created commission appears in commission payments list", async ({ page }) => {
    const api: Array<{ status: number; url: string; body: string }> = [];
    let created: CreatedCommission | null = null;
    page.on("response", async (res) => {
      const url = res.url();
      if (!url.includes("/api/projects/")) return;
      if (!url.includes("/commissions")) return;
      const status = res.status();
      const body = await res.text().catch(() => "");
      api.push({ status, url, body });
    });

    try {
      const marker = await createMarkerCommission(page);
      created = marker;

      // Go to finance commissions and ensure we can find the newly-created person name.
      await page.goto("/financial/commissions", { waitUntil: "domcontentloaded" });
      await expect(page.getByText(marker.personName, { exact: false })).toBeVisible({
        timeout: 15000,
      });

      // If the API returned an error JSON but still 200, fail with details.
      const bad = api.filter((r) => r.status >= 400);
      expect(bad).toEqual([]);
    } finally {
      await cleanupMarkerCommission(page, created);
    }
  });

  test("record payment updates paid/outstanding", async ({ page }) => {
    const apiErrors: string[] = [];
    let created: CreatedCommission | null = null;
    page.on("response", async (res) => {
      const url = res.url();
      if (!url.includes("/api/projects/")) return;
      if (!url.includes("/commissions/")) return;
      if (res.status() >= 400) {
        const body = await res.text().catch(() => "");
        apiErrors.push(`${res.status()} ${url}\n${body}`);
      }
    });

    try {
      const marker = await createMarkerCommission(page);
      created = marker;
      await page.goto("/financial/commissions", { waitUntil: "domcontentloaded" });
      if (page.url().includes("/login")) throw new Error("Auth required (redirected to /login).");
      await expect(page.getByText(marker.personName, { exact: false })).toBeVisible({
        timeout: 15000,
      });

      // Click Record Payment only on the marker commission created by this test.
      const row = page.locator("tbody tr").filter({ hasText: marker.personName }).first();
      await expect(row).toBeVisible({ timeout: 10000 });
      const recordBtn = row.getByRole("button", { name: /record payment/i });
      await expect(recordBtn).toBeVisible({ timeout: 10000 });

      const paidCellBefore = row.locator("td").nth(4);
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
    } finally {
      await cleanupMarkerCommission(page, created);
    }
  });
});
