import { test, expect } from "@playwright/test";
import { e2eTargetOrigin } from "./e2e-env-helpers";

const BASE = e2eTargetOrigin();

function projectIdsFromList(container: import("@playwright/test").Locator): Promise<string[]> {
  return container.locator('a[href^="/projects/"]').evaluateAll((anchors) => {
    const ids: string[] = [];
    for (const a of anchors) {
      const href = (a as HTMLAnchorElement).getAttribute("href") ?? "";
      const m = href.match(/^\/projects\/([^/?#]+)/);
      if (m) ids.push(m[1]);
    }
    return ids;
  });
}

test.describe("/financial/owner", () => {
  test.describe.configure({ timeout: 150_000 });

  test("loads with KPIs, project financial, alerts; no duplicate losing project rows", async ({
    page,
  }) => {
    const res = await page.goto(`${BASE}/financial/owner`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    expect(res?.status()).not.toBe(500);
    if (res?.status() === 404) {
      test.skip(true, "Route 404: /financial/owner");
    }

    const main = page.locator("main").first();
    await main.waitFor({ state: "visible", timeout: 90_000 });

    const body = page.locator("body");
    await expect(body).not.toContainText("Internal Server Error");
    await expect(body).not.toContainText("Application error: a client-side exception has occurred");

    await expect(page.getByRole("heading", { name: "Finance dashboard", level: 1 })).toBeVisible();

    // KPI cards (this month: 6 metrics)
    await expect(page.locator(".kpi-metric")).toHaveCount(6);

    // Project financial section (canonical profit list)
    await expect(main.getByText("Top projects", { exact: true })).toBeVisible();
    await expect(main.getByText(/contract \+ approved CO vs/i)).toBeVisible();
    const topProjects = main.getByTestId("owner-top-projects");
    await expect(topProjects).toBeVisible();

    // Alerts
    await expect(main.getByRole("heading", { name: "Alerts", level: 2 })).toBeVisible();

    // No project appears in both "Top projects" and "In the red" (deduped in data layer)
    const topIds = await projectIdsFromList(topProjects);
    expect(new Set(topIds).size).toBe(topIds.length);

    const inTheRedHeader = main.getByText("In the red", { exact: true });
    if (await inTheRedHeader.isVisible().catch(() => false)) {
      const underwater = main.getByTestId("owner-underwater-projects");
      await expect(underwater).toBeVisible();
      const redIds = await projectIdsFromList(underwater);
      expect(new Set(redIds).size).toBe(redIds.length);
      const overlap = topIds.filter((id) => redIds.includes(id));
      expect(overlap, `project id(s) in both top and underwater: ${overlap.join(", ")}`).toEqual(
        []
      );
    }
  });
});
