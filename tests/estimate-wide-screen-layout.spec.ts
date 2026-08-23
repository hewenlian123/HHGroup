import { expect, test, type Page } from "@playwright/test";

import { loginAsE2EOwner } from "./e2e-auth-owner";

const DENSE_ESTIMATE_ID = "edc68a63-cb87-4298-8231-9c668bf43ffe";

type LayoutSample = {
  viewport: number;
  workspaceWidth: number;
  horizontalOverflow: number;
  columns: number[];
};

async function readLayoutSample(page: Page): Promise<LayoutSample> {
  await expect(page.locator(".estimate-builder-page")).toBeVisible();
  await expect(page.locator(".eb-line-item-grid-header").first()).toBeVisible();

  return page.evaluate(() => {
    const workspace = document.querySelector<HTMLElement>(".estimate-builder-page");
    const header = document.querySelector<HTMLElement>(".eb-line-item-grid-header");
    const app = document.querySelector<HTMLElement>("[data-app-scroll-root]");
    if (!workspace || !header) throw new Error("Estimate desktop layout is unavailable.");

    return {
      viewport: window.innerWidth,
      workspaceWidth: workspace.getBoundingClientRect().width,
      horizontalOverflow: Math.max(
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
        app ? app.scrollWidth - app.clientWidth : 0
      ),
      columns: Array.from(header.children).map((column) =>
        Number(column.getBoundingClientRect().width.toFixed(2))
      ),
    };
  });
}

test.describe("Estimate wide-screen layout", () => {
  test("expands progressively, caps deliberately, and gives additional width to Description", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await loginAsE2EOwner(page, `/estimates/${DENSE_ESTIMATE_ID}`);

    const samples: LayoutSample[] = [];
    for (const width of [1280, 1440, 1600, 1728, 1800, 1920, 2560]) {
      await page.setViewportSize({ width, height: 1000 });
      samples.push(await readLayoutSample(page));
    }

    for (const sample of samples) {
      expect(sample.horizontalOverflow).toBe(0);
      expect(sample.columns).toHaveLength(8);
    }

    expect(samples[1].workspaceWidth).toBeGreaterThan(samples[0].workspaceWidth + 100);
    expect(samples[2].workspaceWidth).toBeGreaterThan(samples[1].workspaceWidth + 100);
    expect(samples[3].workspaceWidth).toBeGreaterThan(samples[2].workspaceWidth + 100);

    expect(samples[4].workspaceWidth).toBeGreaterThanOrEqual(1480);
    expect(samples[4].workspaceWidth).toBeLessThanOrEqual(1520);
    expect(Math.abs(samples[5].workspaceWidth - samples[4].workspaceWidth)).toBeLessThanOrEqual(2);
    expect(Math.abs(samples[6].workspaceWidth - samples[5].workspaceWidth)).toBeLessThanOrEqual(2);

    const compactColumns = samples[0].columns;
    const wideColumns = samples[5].columns;
    const itemGrowth = wideColumns[1] - compactColumns[1];
    const descriptionGrowth = wideColumns[2] - compactColumns[2];

    expect(descriptionGrowth).toBeGreaterThan(itemGrowth * 3);
    expect(wideColumns[1]).toBeGreaterThanOrEqual(230);
    expect(wideColumns[1]).toBeLessThanOrEqual(240);
    expect(wideColumns[2]).toBeGreaterThanOrEqual(680);
    expect(wideColumns[2]).toBeLessThanOrEqual(720);
    for (const index of [3, 4, 5, 6, 7]) {
      expect(Math.abs(wideColumns[index] - compactColumns[index])).toBeLessThanOrEqual(2);
    }
  });

  test("keeps the editable Scope toolbar compact on one row at 1280", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await loginAsE2EOwner(page, `/estimates/${DENSE_ESTIMATE_ID}`);
    await page.getByRole("button", { name: "Edit", exact: true }).click();

    const toolbar = page.getByRole("toolbar", { name: "Scope tools" });
    const search = page.getByRole("combobox", { name: "Search scope" });
    const jump = page.getByRole("combobox", { name: "Jump to section" });
    const collapse = page.getByRole("button", { name: "Collapse all" });
    const expand = page.getByRole("button", { name: "Expand all" });
    const addSection = page.getByRole("button", { name: "Add Section", exact: true });

    await expect(toolbar).toBeVisible();
    await expect(addSection).toBeVisible();

    const boxes = await Promise.all(
      [search, jump, collapse, expand, addSection].map((locator) => locator.boundingBox())
    );
    expect(boxes.every(Boolean)).toBe(true);

    const topEdges = boxes.map((box) => box?.y ?? 0);
    expect(Math.max(...topEdges) - Math.min(...topEdges)).toBeLessThanOrEqual(2);
    expect(boxes[0]?.width ?? 0).toBeGreaterThan(400);
    expect(boxes[1]?.width ?? 0).toBeLessThanOrEqual(224);

    await page.getByRole("button", { name: "Done", exact: true }).first().click();
  });
});
