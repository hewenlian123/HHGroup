import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "./fixture";
import { E2E_PRESERVED_PROJECT_ID as projectId } from "../e2e-cleanup-db";

const sections = [
  ["overview", "Overview"],
  ["schedule", "Schedule"],
  ["tasks", "Tasks"],
  ["punch-list", "Punch"],
  ["photos", "Photos"],
  ["inspections", "Inspections"],
  ["materials", "Materials"],
  ["change-orders", "Change Orders"],
  ["documents", "Documents"],
  ["financial", "Financials"],
] as const;
const operations = [
  ["schedule", "/schedule", /new schedule item/i],
  ["punch-list", "/punch-list", /add issue/i],
  ["photos", "/site-photos", /upload photo/i],
  ["inspections", "/inspection-log", /new inspection/i],
] as const;

async function healthy(page: Page) {
  await expect(page.locator("[data-app-scroll-root]")).toBeVisible();
  await expect(
    page
      .getByText(
        /Application error|Unhandled Runtime Error|Internal Server Error|Unable to load data/
      )
      .first()
  ).not.toBeVisible();
  expect(
    await page.evaluate(
      () => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth
    )
  ).toBeLessThanOrEqual(2);
}

async function selectSection(page: Page, key: string, label: string) {
  const nav = page.getByRole("navigation", { name: "Project workspace", exact: true });
  const tab = nav.getByRole("tab", { name: label, exact: true });
  if (await tab.isVisible()) await tab.click();
  else {
    await nav.getByRole("button", { name: "More project sections" }).click();
    await page.getByRole("menuitem", { name: label, exact: true }).click();
  }
  await expect(page).toHaveURL(new RegExp(`tab=${key}(?:&|$)`));
  await expect(page.getByRole("tabpanel")).toBeVisible();
  await expect(page.getByRole("tabpanel").getByText(/^Loading .*data…$/)).toHaveCount(0);
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
]) {
  test(`Projects workspace ${viewport.width}`, async ({ page }, testInfo) => {
    test.setTimeout(360_000);
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`${page.url()}: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`${page.url()}: ${m.text()}`);
    });
    await page.goto("/projects");
    await healthy(page);
    const projectLink =
      viewport.width < 768
        ? page.locator(`a[href="/projects/${projectId}"]:visible`).first()
        : page
            .locator("tr[role=link]")
            .filter({ has: page.getByTestId(`project-list-actual-cost-${projectId}`) });
    await expect(projectLink).toBeVisible();
    await projectLink.click();
    const context = page.locator(`[data-project-context="${projectId}"]`);
    await expect(context).toBeVisible();
    const projectName = await context.getByRole("heading").innerText();
    // A query tab keeps unrelated parameters and the project URL while changing sections.
    await page.goto(`/projects/${projectId}?tab=overview&workspaceSmoke=1`);
    await expect(context).toContainText(projectName);
    await expect(page.getByTestId("project-header-actual-cost")).not.toHaveText("—");
    const actualCost = await page.getByTestId("project-header-actual-cost").innerText();
    const contract = await page.getByTestId("project-header-contract-value").innerText();
    for (const [key, label] of sections) {
      await test.step(label, async () => {
        await selectSection(page, key, label);
        await expect(page).toHaveURL(/workspaceSmoke=1/);
        await expect(context).toContainText(projectName);
        await expect(page.getByTestId("project-header-actual-cost")).toHaveText(actualCost);
        await expect(page.getByTestId("project-header-contract-value")).toHaveText(contract);
        const panel = page.getByRole("tabpanel");
        const op = operations.find(([tab]) => tab === key);
        if (op) {
          const add = panel
            .locator("[data-page-header], [data-mobile-list-header]")
            .getByRole("button", { name: op[2] })
            .filter({ visible: true });
          await expect(add).toBeVisible();
          await add.click();
          const dialog = page.getByRole("dialog").filter({ visible: true });
          const projectSelect = dialog.getByRole("combobox", { name: "Project", exact: true });
          await expect(projectSelect).toHaveValue(projectId);
          await expect(projectSelect).toBeDisabled();
          await page.screenshot({ path: testInfo.outputPath(`${key}-form-${viewport.width}.png`) });
          await page.keyboard.press("Escape");
          await expect(dialog).not.toBeVisible();
        } else if (key === "tasks") {
          await panel.getByRole("button", { name: "+ New Task", exact: true }).click();
          await expect(page.getByRole("dialog")).toContainText("Add a task to this project.");
          await expect(
            page.getByRole("dialog").getByRole("combobox", { name: "Project", exact: true })
          ).toHaveCount(0);
          await page.keyboard.press("Escape");
        } else if (key === "change-orders") {
          await expect(panel.getByRole("link", { name: "New change order" })).toHaveAttribute(
            "href",
            `/projects/${projectId}/change-orders/new`
          );
        } else if (key === "financial") {
          await expect(panel.getByText("Revenue", { exact: true })).toBeVisible();
          const snapshotResponse = await page.request.get(
            `/api/projects/${projectId}/financial-snapshot`
          );
          expect(snapshotResponse.ok()).toBe(true);
          const snapshot = (await snapshotResponse.json()).comparison.newSnapshot;
          await expect(page.getByTestId("snapshot-cost-actual")).toHaveText(
            new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
              snapshot.actualCost
            )
          );
        }
        await healthy(page);
        await page.screenshot({ path: testInfo.outputPath(`${key}-${viewport.width}.png`) });
      });
    }
    // Legacy query links remain addressable, including restored Punch and Change Orders.
    for (const [alias, label] of [
      ["work", "Tasks"],
      ["docs", "Documents"],
      ["punch-list", "Punch"],
      ["change-orders", "Change Orders"],
      ["financial", "Financials"],
      ["people", "People"],
      ["closeout", "Closeout"],
    ]) {
      await page.goto(`/projects/${projectId}?tab=${alias}`);
      await expect(context).toContainText(projectName);
      await expect(page.getByRole("tabpanel")).toBeVisible();
      if (label === "People" || label === "Closeout") {
        await page.getByRole("button", { name: "More project sections" }).click();
        await expect(page.getByRole("menuitem", { name: label, exact: true })).toHaveAttribute(
          "aria-current",
          "page"
        );
        await page.keyboard.press("Escape");
      }
      await healthy(page);
    }
    for (const [tab, route, addName] of operations) {
      await page.goto(`${route}?project_id=${projectId}`);
      await page
        .locator("[data-page-header], [data-mobile-list-header]")
        .getByRole("button", { name: addName })
        .filter({ visible: true })
        .click();
      await expect(
        page.getByRole("dialog").getByRole("combobox", { name: "Project", exact: true })
      ).toHaveValue(projectId);
      await page.keyboard.press("Escape");
      await page.getByRole("link", { name: "Back to project", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/projects/${projectId}\\?tab=${tab}$`));
      await page.getByRole("link", { name: /^All projects ·/ }).click();
      await expect(page).toHaveURL(new RegExp(`${route}$`));
      await page
        .locator("[data-page-header], [data-mobile-list-header]")
        .getByRole("button", { name: addName })
        .filter({ visible: true })
        .click();
      await expect(
        page.getByRole("dialog").getByRole("combobox", { name: "Project", exact: true })
      ).toBeEnabled();
      await page.keyboard.press("Escape");
      await page.goBack();
      await expect(context).toContainText(projectName);
    }
    await selectSection(page, "overview", "Overview");
    if (viewport.width < 1024) {
      await expect(
        page.getByRole("navigation", { name: "Project workspace", exact: true }).getByRole("tab")
      ).toHaveCount(4);
    }
    const contrast = await new AxeBuilder({ page })
      .include('nav[aria-label="Project workspace"]')
      .withRules(["color-contrast"])
      .analyze();
    expect(contrast.violations).toEqual([]);
    await page.emulateMedia({ forcedColors: "active" });
    await page.getByRole("button", { name: "More project sections" }).focus();
    await page.screenshot({ path: testInfo.outputPath(`forced-colors-${viewport.width}.png`) });
    await page.emulateMedia({ forcedColors: "none" });
    await page
      .getByRole("link", { name: "Projects", exact: true })
      .filter({ visible: true })
      .last()
      .click();
    await expect(page).toHaveURL(/\/projects$/);
    await testInfo.attach("console-errors", {
      body: JSON.stringify(errors, null, 2),
      contentType: "application/json",
    });
    expect(errors).toEqual([]);
  });
}
